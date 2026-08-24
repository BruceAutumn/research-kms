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
    private static final long MAX_PDF_BYTES = 50L * 1024L * 1024L;
    private static final int MAX_PDF_PAGES = 5_000;
    private static final int MAX_EXTRACTED_TEXT_CHARS = 5_000_000;
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
        if (file.getSize() > MAX_PDF_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "PDF exceeds the 50MB upload limit.");
        }
        try (var input = file.getInputStream()) {
            byte[] signature = input.readNBytes(5);
            if (signature.length < 5 || signature[0] != '%' || signature[1] != 'P'
                    || signature[2] != 'D' || signature[3] != 'F' || signature[4] != '-') {
                throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "File content is not a PDF.");
            }
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to inspect PDF upload.");
        }

        Path target = null;
        try {
            Files.createDirectories(pdfDir);
            target = pdfDir.resolve(UUID.randomUUID() + ".pdf").toAbsolutePath().normalize();
            file.transferTo(target);

            // 上传时用 PDFBox 一次性做两件事：抽全文 + 读 PDF 内嵌属性（不调用 LLM）。
            String pdfText;
            String embeddedTitle = null;
            String embeddedAuthor = null;
            Integer embeddedYear = null;
            try (PDDocument document = Loader.loadPDF(target.toFile())) {
                if (document.getNumberOfPages() > MAX_PDF_PAGES) {
                    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "PDF has too many pages.");
                }
                PDFTextStripper stripper = new PDFTextStripper();
                pdfText = sanitizePdfText(stripper.getText(document));
                if (pdfText.length() > MAX_EXTRACTED_TEXT_CHARS) {
                    throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "Extracted PDF text is too large.");
                }
                PDDocumentInformation info = document.getDocumentInformation();
                if (info != null) {
                    embeddedTitle = info.getTitle();
                    embeddedAuthor = info.getAuthor();
                    Calendar created = info.getCreationDate();
                    if (created != null) embeddedYear = created.get(Calendar.YEAR);
                }
            }

            String resolvedTitle = !isBlank(embeddedTitle) ? embeddedTitle.trim() : stripPdfExtension(originalName);

            // 重复检测：按标题精确匹配（忽略大小写）
            Paper existing = paperRepository.findByUserIdAndTitleIgnoreCase(CurrentUser.ID, resolvedTitle).orElse(null);
            if (existing != null) {
                // 删除刚写入的临时文件，返回已有论文
                try { Files.deleteIfExists(target); } catch (IOException ignored) { }
                throw new ApiException(HttpStatus.CONFLICT,
                    "检测到重复文献：「" + existing.getTitle() + "」（已存在，ID=" + existing.getId() + "）");
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
        } catch (ApiException ex) {
            if (target != null) try { Files.deleteIfExists(target); } catch (IOException ignored) { }
            throw ex;
        } catch (IOException ex) {
            if (target != null) try { Files.deleteIfExists(target); } catch (IOException ignored) { }
            throw new ApiException(HttpStatus.BAD_REQUEST, "Failed to save or parse PDF: " + ex.getMessage());
        }
    }

    public List<PaperDto> search(String q, String tag) {
        return search(q, tag, null);
    }

    /**
     * filter 枚举（兼容 v1 值，Phase 3 扩展）：
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
        // TODO: v1 使用 key-value 行存储，灵活但不利于数值筛选；后续可迁移到 jsonb 保存结构化 Metadata。
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
     * 单点提取（路径不变）：真实 LLM 返回带置信度的建议，
     * 同时落库到 ai_extraction（PENDING）。响应结构保持 v1 兼容（legacy 页面继续可用）。
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
     * 更新阅读状态与评级（Zotero 式分诊）。两个字段都可单独更新，传 null 表示不动。
     * 非法取值直接拒绝而不是静默夹紧 —— 夹紧会让「我明明点了 5 星怎么变成 3 星」无从排查。
     */
    @Transactional
    public PaperDto updateReadingState(Long id, String readStatus, Integer rating) {
        Paper paper = findPaper(id);
        if (readStatus != null) {
            String next = readStatus.trim().toLowerCase(java.util.Locale.ROOT);
            if (!java.util.List.of("unread", "reading", "done").contains(next)) {
                throw new ApiException(HttpStatus.BAD_REQUEST,
                        "阅读状态只能是 unread / reading / done，收到: " + readStatus);
            }
            paper.setReadStatus(next);
        }
        if (rating != null) {
            if (rating < 0 || rating > 5) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "评级范围是 0-5，收到: " + rating);
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
     * 清理 PDFBox 抽取的文本：PostgreSQL text 类型不接受 NULL 字节（0x00），
     * 同时移除其他不可见控制字符（保留 \t \n \r），避免 INSERT 时报
     * "invalid byte sequence for encoding UTF8: 0x00"。
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
