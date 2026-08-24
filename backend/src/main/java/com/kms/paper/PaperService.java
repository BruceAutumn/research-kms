package com.kms.paper;

import com.kms.ai.OpenAiCompatibleClient;
import com.kms.ai.dto.ExtractedField;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.ExtractionService;
import com.kms.paper.dto.ExtractResponse;
import com.kms.paper.dto.MetadataDto;
import com.kms.paper.dto.MetadataSaveResult;
import com.kms.paper.dto.PaperDto;
import com.kms.paper.dto.PaperUpdateRequest;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDDocumentInformation;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.OffsetDateTime;
import java.util.Calendar;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class PaperService {
    private final PaperRepository paperRepository;
    private final PaperMetadataRepository metadataRepository;
    private final OpenAiCompatibleClient llmClient;
    private final ExtractionService extractionService;
    private final Path pdfDir;

    public PaperService(
            PaperRepository paperRepository,
            PaperMetadataRepository metadataRepository,
            OpenAiCompatibleClient llmClient,
            ExtractionService extractionService,
            @Value("${app.storage.pdf-dir:./data/pdfs}") String pdfDir
    ) {
        this.paperRepository = paperRepository;
        this.metadataRepository = metadataRepository;
        this.llmClient = llmClient;
        this.extractionService = extractionService;
        this.pdfDir = Paths.get(pdfDir);
    }

    @Transactional
    public PaperDto upload(MultipartFile file) {
        if (file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Uploaded file is empty.");
        }
        String originalName = file.getOriginalFilename() == null ? "paper.pdf" : file.getOriginalFilename();
        if (!originalName.toLowerCase().endsWith(".pdf")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Only PDF files are supported.");
        }

        try {
            Files.createDirectories(pdfDir);
            Path target = pdfDir.resolve(UUID.randomUUID() + ".pdf").toAbsolutePath().normalize();
            file.transferTo(target);

            // Use on upload PDFBox Onedo two things at once: extractFull Text + Read PDF Inline Property(No Call LLM). 
            String pdfText;
            String embeddedTitle = null;
            String embeddedAuthor = null;
            Integer embeddedYear = null;
            try (PDDocument document = Loader.loadPDF(target.toFile())) {
                PDFTextStripper stripper = new PDFTextStripper();
                pdfText = sanitizePdfText(stripper.getText(document));
                PDDocumentInformation info = document.getDocumentInformation();
                if (info != null) {
                    embeddedTitle = info.getTitle();
                    embeddedAuthor = info.getAuthor();
                    Calendar created = info.getCreationDate();
                    if (created != null) embeddedYear = created.get(Calendar.YEAR);
                }
            }

            String resolvedTitle = !isBlank(embeddedTitle) ? embeddedTitle.trim() : stripPdfExtension(originalName);

            // Duplicate Detection: Exact match by title(ignoreLargeLowercase)
            Paper existing = paperRepository.findByUserIdAndTitleIgnoreCase(CurrentUser.ID, resolvedTitle).orElse(null);
            if (existing != null) {
                // Delete just-written temp file, BackExistingPaper
                try { Files.deleteIfExists(target); } catch (IOException ignored) { }
                throw new ApiException(HttpStatus.CONFLICT,
                    "Detected duplicate paper: "" + existing.getTitle() + ""(Exists, ID=" + existing.getId() + ")");
            }

            Paper paper = new Paper();
            paper.setUserId(CurrentUser.ID);
            paper.setTitle(resolvedTitle);
            paper.setAuthors(!isBlank(embeddedAuthor) ? embeddedAuthor.trim() : null);
            paper.setYear(embeddedYear);
            paper.setPdfPath(target.toString());
            paper.setPdfText(pdfText);
            paper.setAbstractText(AbstractExtractor.extract(pdfText));
            paper.setTags(new String[0]);
            paper.setAiStatus("NOT_PROCESSED");
            paper.setProcessStatus("READY");
            return toDto(paperRepository.save(paper));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to save or parse PDF: " + ex.getMessage());
        }
    }

    public List<PaperDto> search(String q, String tag) {
        return search(q, tag, null);
    }

    /**
     * filter enum(Compat v1 value, Phase 3 Extension): 
     * all|recent|no_metadata|with_notes|no_notes|recently_read|favorites|unread|ai_processed|ai_pending|trash
     */
    public List<PaperDto> search(String q, String tag, String filter) {
        Long userId = CurrentUser.ID;
        List<Paper> papers;
        if (filter == null || filter.isBlank() || "all".equals(filter) || "recent".equals(filter)) {
            papers = paperRepository.search(userId, q, tag);
        } else {
            papers = switch (filter) {
                case "no_metadata" -> paperRepository.findWithoutMetadata(userId);
                case "with_notes" -> paperRepository.findWithNotes(userId);
                case "no_notes" -> paperRepository.findWithoutNotes(userId);
                case "recently_read" -> paperRepository.findRecentlyRead(userId);
                case "favorites" -> paperRepository.findFavorites(userId);
                case "unread" -> paperRepository.findUnread(userId);
                case "ai_processed" -> paperRepository.findAiProcessed(userId);
                case "ai_pending" -> paperRepository.findAiPending(userId);
                case "trash" -> paperRepository.findTrashed(userId);
                default -> paperRepository.search(userId, q, tag);
            };
        }
        return papers.stream().map(this::toDto).toList();
    }

    public PaperDto get(Long id) {
        return toDto(findPaper(id));
    }

    public Paper findPaper(Long id) {
        return paperRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Paper not found."));
    }

    @Transactional
    public PaperDto update(Long id, PaperUpdateRequest request) {
        Paper paper = findPaper(id);
        if (request.getTitle() != null) paper.setTitle(request.getTitle());
        if (request.getAuthors() != null) paper.setAuthors(request.getAuthors());
        if (request.getJournal() != null) paper.setJournal(request.getJournal());
        if (request.getYear() != null) paper.setYear(request.getYear());
        if (request.getDoi() != null) paper.setDoi(request.getDoi());
        if (request.getVolume() != null) paper.setVolume(request.getVolume());
        if (request.getPages() != null) paper.setPages(request.getPages());
        if (request.getUrl() != null) paper.setUrl(request.getUrl());
        if (request.getAbstractText() != null) paper.setAbstractText(request.getAbstractText());
        if (request.getTags() != null) paper.setTags(request.getTags());
        if (request.getFavorite() != null) paper.setFavorite(request.getFavorite());
        if (request.getTrashed() != null) paper.setTrashed(request.getTrashed());
        paper.setDateModified(OffsetDateTime.now());
        return toDto(paperRepository.save(paper));
    }

    @Transactional
    public void delete(Long id) {
        Paper paper = findPaper(id);
        String pdfPath = paper.getPdfPath();
        paperRepository.delete(paper);
        if (pdfPath != null && !pdfPath.isBlank()) {
            try {
                Files.deleteIfExists(Path.of(pdfPath));
            } catch (IOException ex) {
                throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Paper deleted, but PDF file could not be removed: " + ex.getMessage());
            }
        }
    }

    @Transactional
    public PaperDto markOpened(Long id) {
        Paper paper = findPaper(id);
        paper.setLastOpenedAt(OffsetDateTime.now());
        return toDto(paperRepository.save(paper));
    }

    public List<PaperDto> related(Long id) {
        findPaper(id);
        return paperRepository.findRelated(CurrentUser.ID, id).stream()
                .map(this::toDto)
                .toList();
    }

    public UrlResource getPdfResource(Long id) {
        Paper paper = findPaper(id);
        if (paper.getPdfPath() == null || paper.getPdfPath().isBlank()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "PDF file not found.");
        }
        try {
            UrlResource resource = new UrlResource(Path.of(paper.getPdfPath()).toUri());
            if (!resource.exists() || !resource.isReadable()) {
                throw new ApiException(HttpStatus.NOT_FOUND, "PDF file not found on disk.");
            }
            return resource;
        } catch (MalformedURLException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Invalid PDF path: " + ex.getMessage());
        }
    }

    public List<MetadataDto> getMetadata(Long id) {
        findPaper(id);
        return metadataRepository.findByPaperIdOrderByIdAsc(id).stream()
                .map(row -> new MetadataDto(row.getKey(), row.getValue()))
                .toList();
    }

    @Transactional
    public MetadataSaveResult replaceMetadata(Long id, List<MetadataDto> fields) {
        Paper paper = findPaper(id);
        metadataRepository.deleteByPaperId(id);
        // TODO: v1 use key-value Row Storage, flexibleButnot good forNumericFilter; follow-upCanmigrate to jsonb Save Structured Metadata. 
        Map<String, String> cleaned = new LinkedHashMap<>();
        int droppedEmptyKeys = 0;
        List<String> overwrittenKeys = new java.util.ArrayList<>();
        if (fields != null) {
            for (MetadataDto field : fields) {
                if (field.key() == null || field.key().isBlank()) {
                    droppedEmptyKeys++;
                    continue;
                }
                String trimmedKey = field.key().trim();
                if (cleaned.containsKey(trimmedKey)) {
                    overwrittenKeys.add(trimmedKey);
                }
                cleaned.put(trimmedKey, field.value());
            }
        }
        List<PaperMetadata> rows = cleaned.entrySet().stream()
                .map(field -> {
                    PaperMetadata row = new PaperMetadata();
                    row.setPaperId(id);
                    row.setKey(field.getKey());
                    row.setValue(field.getValue());
                    return row;
                })
                .toList();
        metadataRepository.saveAll(rows);
        paper.setDateModified(OffsetDateTime.now());
        paperRepository.save(paper);
        List<MetadataDto> saved = getMetadata(id);
        return new MetadataSaveResult(saved, saved.size(), droppedEmptyKeys, overwrittenKeys);
    }

    /**
     * Single Point Extraction(Path unchanged): Real LLM BackSuggestions with confidence, 
     * also persist to ai_extraction(PENDING). Response structure kept v1 Compat(legacy Page remains usable). 
     */
    @Transactional
    public ExtractResponse extractMetadata(Long id) {
        Paper paper = findPaper(id);
        paper.setAiStatus("EXTRACTING");
        paperRepository.save(paper);
        try {
            List<ExtractedField> fields = llmClient.extractFields(paper.getPdfText());
            extractionService.storePending(paper, fields, llmClient.currentModelId());
            paper.setAiStatus("REVIEW_REQUIRED");
            paperRepository.save(paper);
            return new ExtractResponse(fields.stream()
                    .map(field -> new MetadataDto(field.key(), field.value()))
                    .toList());
        } catch (RuntimeException ex) {
            paper.setAiStatus("FAILED");
            paperRepository.save(paper);
            throw ex;
        }
    }

    /**
     * Update reading state and rating(Zotero triage). twoFieldallCanseparateUpdate, pass null Tableshow unchanged. 
     * illegal value rejectInstead ofsilent clamp -- clamp will"I clearly clicked 5 Star becomes 3 star"no way to sortQuery. 
     */
    @Transactional
    public PaperDto updateReadingState(Long id, String readStatus, Integer rating) {
        Paper paper = findPaper(id);
        if (readStatus != null) {
            String next = readStatus.trim().toLowerCase(java.util.Locale.ROOT);
            if (!java.util.List.of("unread", "reading", "done").contains(next)) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "Reading state can only be unread / reading / done, received: " + readStatus);
            }
            paper.setReadStatus(next);
        }
        if (rating != null) {
            if (rating < 0 || rating > 5) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "Rating range is 0-5, received: " + rating);
            }
            paper.setRating(rating.shortValue());
        }
        return toDto(paperRepository.save(paper));
    }

    public PaperDto toDto(Paper paper) {
        return new PaperDto(
                paper.getId(),
                paper.getUserId(),
                paper.getTitle(),
                paper.getAuthors(),
                paper.getJournal(),
                paper.getYear(),
                paper.getDoi(),
                paper.getVolume(),
                paper.getPages(),
                paper.getUrl(),
                paper.getAbstractText(),
                paper.getTags() == null ? new String[0] : paper.getTags(),
                paper.getPdfPath(),
                paper.getAiStatus(),
                paper.isFavorite(),
                paper.isTrashed(),
                paper.getReadStatus(),
                paper.getRating(),
                paper.getProcessStatus(),
                paper.getCreatedAt(),
                paper.getDateModified(),
                paper.getLastOpenedAt()
        );
    }

    private String stripPdfExtension(String filename) {
        return filename.replaceFirst("(?i)\\.pdf$", "");
    }

    /**
     * Clean PDFBox extracted text: PostgreSQL text type not accept NULL byte(0x00), 
     * alsoRemoveOthernotVisiblecontrol char(Keep \t \n \r), Avoid INSERT when report
     * "invalid byte sequence for encoding UTF8: 0x00". 
     */
    public static String sanitizePdfText(String raw) {
        if (raw == null) return null;
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char ch = raw.charAt(i);
            if (ch == 0 || (ch < 0x20 && ch != '\t' && ch != '\n' && ch != '\r')) continue;
            sb.append(ch);
        }
        return sb.toString();
    }

    public java.util.Map<String, Object> backfillAbstracts() {
        List<Paper> papers = paperRepository.findAll();
        int scanned = 0, filled = 0, skipped = 0, failed = 0;
        java.util.List<String> details = new java.util.ArrayList<>();
        for (Paper paper : papers) {
            if (paper.getAbstractText() != null && !paper.getAbstractText().isBlank()) {
                skipped++;
                continue;
            }
            if (paper.getPdfText() == null || paper.getPdfText().isBlank()) {
                skipped++;
                continue;
            }
            scanned++;
            try {
                String extracted = AbstractExtractor.extract(paper.getPdfText());
                if (extracted != null) {
                    paper.setAbstractText(extracted);
                    paperRepository.save(paper);
                    filled++;
                    details.add("paper " + paper.getId() + ": filled " + extracted.length() + " chars");
                } else {
                    failed++;
                    details.add("paper " + paper.getId() + ": extraction returned null");
                }
            } catch (Exception e) {
                failed++;
                details.add("paper " + paper.getId() + ": " + e.getMessage());
            }
        }
        return java.util.Map.of(
            "scanned", scanned,
            "filled", filled,
            "skipped", skipped,
            "failed", failed,
            "details", details
        );
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
