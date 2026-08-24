package com.kms.note;

import com.kms.common.ApiException;
import com.kms.literature.AiExtraction;
import com.kms.literature.AiExtractionRepository;
import com.kms.note.dto.CreatePaperNoteRequest;
import com.kms.note.dto.NoteDto;
import com.kms.note.dto.NoteRequest;
import com.kms.paper.Paper;
import com.kms.paper.PaperMetadata;
import com.kms.paper.PaperMetadataRepository;
import com.kms.paper.PaperService;
import com.kms.vault.FrontmatterService;
import com.kms.vault.LinkService;
import com.kms.vault.VaultService;
import org.springframework.context.annotation.Lazy;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Phase 4 start NoteService is"File First" Compat Layer: 
 *   - Source of Truth = Vault Under dir .md File(Write file first, Update index on success); 
 *   - legacy /api/notes/{id} that APIKeepnot delete(Old page still in use), All internal
 *     delegate to VaultService(By path go, via VaultPathResolver check); 
 *   - Old world   DB-only Note(no path Line)alreadyBy Phase 4 decisionClear, Vault fromEmptystart from empty. 
 */
@Service
public class NoteService {

    private final NoteRepository noteRepository;
    private final VaultService vaultService;
    private final FrontmatterService frontmatterService;
    private final LinkService linkService;
    private final PaperService paperService;
    private final PaperMetadataRepository metadataRepository;
    private final AiExtractionRepository aiExtractionRepository;

    public NoteService(NoteRepository noteRepository, VaultService vaultService,
                       FrontmatterService frontmatterService, LinkService linkService,
                       @Lazy PaperService paperService,
                       PaperMetadataRepository metadataRepository,
                       AiExtractionRepository aiExtractionRepository) {
        this.noteRepository = noteRepository;
        this.vaultService = vaultService;
        this.frontmatterService = frontmatterService;
        this.linkService = linkService;
        this.paperService = paperService;
        this.metadataRepository = metadataRepository;
        this.aiExtractionRepository = aiExtractionRepository;
    }

    public List<NoteDto> listByPaper(Long paperId) {
        return noteRepository.findByPaperIdOrderByUpdatedAtDesc(paperId).stream()
                .map(note -> toDto(note, true))
                .toList();
    }

    public List<NoteDto> search(String q) {
        List<NoteDto> result = new ArrayList<>();
        for (Note note : noteRepository.findAllIndexed()) {
            if (q == null || q.isBlank()
                    || note.getTitle().toLowerCase().contains(q.toLowerCase())) {
                result.add(toDto(note, false));
            }
        }
        return result;
    }

    /** legacy POST /api/notes -> in Vault Write root dir .md + Update Index.  */
    public NoteDto create(NoteRequest request) {
        String title = request.getTitle() == null ? "" : request.getTitle().trim();
        if (title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Title cannot be empty. ");
        }
        Map<String, Object> properties = request.getProperties() == null
                ? new LinkedHashMap<>() : request.getProperties();
        if (request.getPaperId() != null) {
            properties.putIfAbsent("paperId", request.getPaperId());
        }
        String content = request.getContent() == null ? "" : request.getContent();
        String body = stripFrontmatterBody(content);
        // already with frontmatter body kept as-is; otherwiseBy properties assemble
        String finalContent;
        if (hasFrontmatter(content)) {
            finalContent = content;
        } else {
            finalContent = frontmatterService.compose(properties, body);
        }
        Map<String, Object> created = vaultService.createNote("", uniqueTitle(title), finalContent);
        Note note = noteRepository.findByPath((String) created.get("path"))
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Index row create failed. "));
        return toDto(note, true);
    }

    public NoteDto get(Long id) {
        Note note = findNote(id);
        return toDto(note, true);
    }

    public NoteDto updateContent(Long id, String content) {
        return updateContent(id, content, null);
    }

    /**
     * Only change body save path(Reader Right Notes tab   800ms Autosave goes here). 
     *
     * expectedVersion non-Emptywhen do optimistic lock checkQuery: notMatchthrow 409 and bring server content and version, 
     * byCallcaller decides"Keep Mine / adoptServer / Manual Merge"-- Server does not choose for user. 
     * expectedVersion asEmpty = Caller explicitly skips concurrency protection(agent Write tool etc scenarios), Behavior same as old. 
     */
    public NoteDto updateContent(Long id, String content, Long expectedVersion) {
        Note note = findNote(id);
        if (expectedVersion != null && expectedVersion != note.getVersion()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "thisNotealreadyOtherWindowSavepass, directlyWritewill overwriteTopartyModify. ",
                    Map.of(
                            "conflict", true,
                            "serverContent", currentContent(note),
                            "serverVersion", note.getVersion(),
                            "yourVersion", expectedVersion));
        }
        if (note.getPath() != null) {
            vaultService.saveFile(note.getPath(), content, null);
        } else {
            note.setContent(content);
        }
        // Indexer may already be saveFile rewrote this line in, so reNewre-increment version. 
        Note latest = note.getPath() == null
                ? note
                : noteRepository.findByPath(note.getPath()).orElse(note);
        latest.setVersion(note.getVersion() + 1);
        noteRepository.save(latest);
        return toDto(latest, true);
    }

    /** takeServercurrentBody(File First, Fall back to index cache on read fail).  */
    private String currentContent(Note note) {
        if (note.getPath() == null) return note.getContent() == null ? "" : note.getContent();
        try {
            Map<String, Object> file = vaultService.readFile(note.getPath());
            Object body = file.get("body");
            if (body == null) body = file.get("content");
            return body == null ? "" : String.valueOf(body);
        } catch (Exception ex) {
            return note.getContent() == null ? "" : note.getContent();
        }
    }

    /** public API: By ID Get note body(File First, Fall back to DB cache on read fail).  */
    public String getContent(Long id) {
        Note note = noteRepository.findById(id).orElse(null);
        if (note == null) return "";
        return currentContent(note);
    }

    public Note findNote(Long id) {
        return noteRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Note not found."));
    }

    public NoteDto getByTitle(String title) {
        return noteRepository.findByTitleIgnoreCase(title).stream()
                .map(note -> toDto(note, true))
                .findFirst()
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Note not found."));
    }

    /** legacy PUT /api/notes/{id} -> changeFile(Title Change = Rename File).  */
    public NoteDto update(Long id, NoteRequest request) {
        Note note = findNote(id);
        if (note.getPath() == null) {
            throw new ApiException(HttpStatus.GONE, "theNoteis not Vault File, cannotUpdate. ");
        }
        String newTitle = request.getTitle() == null ? "" : request.getTitle().trim();
        String currentTitle = note.getTitle();
        String relPath = note.getPath();
        if (!newTitle.isBlank() && !newTitle.equals(currentTitle)) {
            // Title Change -> Rename File(notAutochangeOtherFile Reference, legacy Semantic)
            Map<String, Object> renamed = vaultService.rename(relPath, newTitle, false);
            relPath = (String) renamed.get("path");
        }
        String content = request.getContent() == null ? "" : request.getContent();
        Map<String, Object> properties = request.getProperties() == null
                ? new LinkedHashMap<>() : request.getProperties();
        String finalContent = hasFrontmatter(content)
                ? content
                : frontmatterService.compose(properties, stripFrontmatterBody(content));
        vaultService.saveFile(relPath, finalContent, null);
        Note updated = noteRepository.findByPath(relPath)
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Index row update failed. "));
        return toDto(updated, true);
    }

    public void delete(Long id) {
        Note note = findNote(id);
        if (note.getPath() == null) {
            noteRepository.delete(note);
            return;
        }
        vaultService.delete(note.getPath());
    }

    /** legacy backlinks(By Title)-> File Version(ParsedPath + Unresolved title points to).  */
    public List<NoteDto> backlinks(Long id) {
        Note note = findNote(id);
        if (note.getPath() == null) {
            return List.of();
        }
        List<NoteDto> result = new ArrayList<>();
        for (Map<String, Object> row : linkService.backlinks(note.getPath())) {
            Note source = noteRepository.findByPath((String) row.get("path")).orElse(null);
            if (source != null) {
                result.add(toDto(source, false));
            }
        }
        return result;
    }

    public NoteDto createFromPaper(Long paperId) {
        Paper paper = paperService.findPaper(paperId);
        Note existing = noteRepository.findFirstByPaperIdOrderByUpdatedAtDesc(paperId)
                .filter(note -> note.getPath() != null)
                .orElse(null);
        if (existing != null) {
            return toDto(existing, true);
        }
        String title = uniqueTitle(paper.getTitle());
        List<PaperMetadata> metadata = metadataRepository.findByPaperIdOrderByIdAsc(paperId);
        List<AiExtraction> extractions = aiExtractionRepository.findByPaperIdOrderByIdAsc(paperId);
        String content = buildPaperNoteContent(paper, metadata, extractions);
        NoteRequest request = new NoteRequest();
        request.setTitle(title);
        request.setContent(content);
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("type", "paper-note");
        properties.put("paperId", paperId);
        if (!isBlank(paper.getDoi())) properties.put("doi", paper.getDoi());
        if (paper.getYear() != null) properties.put("year", paper.getYear());
        if (!isBlank(paper.getJournal())) properties.put("journal", paper.getJournal());
        if (paper.getTags() != null && paper.getTags().length > 0) {
            properties.put("tags", Arrays.asList(paper.getTags()));
        }
        properties.put("metadataCount", metadata.size());
        properties.put("aiExtractionCount", extractions.size());
        request.setProperties(properties);
        request.setPaperId(paperId);
        return create(request);
    }

    public NoteDto createFromPaperWithContent(Long paperId, CreatePaperNoteRequest req) {
        Paper paper = paperService.findPaper(paperId);
        String content = req.content() == null ? "" : req.content();
        String folder = req.folder() == null ? "" : req.folder().trim();
        String filename = req.filename() == null ? "" : req.filename().trim();
        String strategy = req.conflictStrategy() == null ? "DUPLICATE" : req.conflictStrategy().toUpperCase();

        validatePath(folder, filename);
        if (filename.isBlank()) {
            filename = sanitizeFilename(paper.getTitle()) + ".md";
        }
        if (!filename.endsWith(".md")) filename = filename + ".md";

        String relPath = folder.isEmpty() ? filename : folder + "/" + filename;

        Note existing = noteRepository.findByPath(relPath).orElse(null);
        if (existing != null) {
            switch (strategy) {
                case "OVERWRITE" -> {
                    vaultService.saveFile(relPath, content, null);
                    return toDto(existing, true);
                }
                case "APPEND" -> {
                    Map<String, Object> current = vaultService.readFile(relPath);
                    String oldContent = (String) current.get("content");
                    vaultService.saveFile(relPath, oldContent + "\n\n" + content, null);
                    return toDto(existing, true);
                }
                default -> {
                    filename = makeUniqueFilename(filename);
                    relPath = folder.isEmpty() ? filename : folder + "/" + filename;
                }
            }
        }

        String title = filename.replaceAll("\\.md$", "");
        Map<String, Object> created = vaultService.createNote(folder, title, content);
        Note note = noteRepository.findByPath((String) created.get("path"))
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Index row create failed. "));
        note.setPaperId(paperId);
        noteRepository.save(note);
        return toDto(note, true);
    }

    private void validatePath(String folder, String filename) {
        // Empty Byte: JVM   Paths.get Will throw InvalidPathException(500), and some underlying syscall will at
        // \0 truncate atPath -- Must block before fs, and return 400 Rather than 500. 
        if (folder.indexOf('\0') >= 0 || filename.indexOf('\0') >= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "illegalPath: withEmpty Byte");
        }
        // folder also block backslash: bothPrevent Windows styleAbsolute Path(C:\Windows), Also prevent ..\..\ variant. 
        if (folder.contains("..") || folder.startsWith("/") || folder.contains("\\")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "illegalPath: folder");
        }
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\") || filename.startsWith("/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "illegalPath: filename");
        }
    }

    private String sanitizeFilename(String title) {
        if (title == null || title.isBlank()) return "untitled";
        return title.replaceAll("[/\\\\:*?\"<>|]", "-").trim().replaceAll("^[.]+|[.]+$", "")
                .substring(0, Math.min(title.length(), 100));
    }

    private String makeUniqueFilename(String filename) {
        String base = filename.replaceAll("\\.md$", "");
        return base + "-copy-" + System.currentTimeMillis() % 10000 + ".md";
    }

    private String buildPaperNoteContent(Paper paper, List<PaperMetadata> metadata, List<AiExtraction> extractions) {
        StringBuilder content = new StringBuilder();
        content.append("# ").append(blankToEmpty(paper.getTitle())).append("\n\n");

        content.append("## Bibliography\n\n");
        appendBullet(content, "Authors", paper.getAuthors());
        appendBullet(content, "Journal", paper.getJournal());
        appendBullet(content, "Year", paper.getYear() == null ? "" : paper.getYear().toString());
        appendBullet(content, "DOI", paper.getDoi());
        appendBullet(content, "Volume", paper.getVolume());
        appendBullet(content, "Pages", paper.getPages());
        appendBullet(content, "URL", paper.getUrl());
        if (paper.getTags() != null && paper.getTags().length > 0) {
            appendBullet(content, "Tags", String.join("; ", paper.getTags()));
        }

        content.append("\n## Abstract\n\n");
        content.append(isBlank(paper.getAbstractText()) ? "No Abstract. \n" : paper.getAbstractText().trim() + "\n");

        content.append("\n## Metadata\n\n");
        if (metadata.isEmpty()) {
            content.append("Noofficial KV metadata. \n");
        } else {
            for (PaperMetadata field : metadata) {
                appendBullet(content, field.getKey(), field.getValue());
            }
        }

        content.append("\n## AI Extraction Review\n\n");
        if (extractions.isEmpty()) {
            content.append("No AI extraction record. \n");
        } else {
            for (AiExtraction row : extractions) {
                String value = !isBlank(row.getUserValue()) ? row.getUserValue() : row.getExtractedValue();
                content.append("- ")
                        .append("[")
                        .append(blankToEmpty(row.getStatus()))
                        .append("] **")
                        .append(blankToEmpty(row.getField()))
                        .append("**");
                List<String> meta = new ArrayList<>();
                if (!isBlank(row.getFieldGroup())) meta.add(row.getFieldGroup());
                if (row.getConfidence() != null) meta.add("confidence " + Math.round(row.getConfidence() * 100) + "%");
                if (!meta.isEmpty()) content.append(" (").append(String.join(", ", meta)).append(")");
                content.append(": ").append(collapse(value)).append("\n");
                if (!isBlank(row.getUserValue()) && !row.getUserValue().equals(row.getExtractedValue())) {
                    content.append("  - AI Original Value: ").append(collapse(row.getExtractedValue())).append("\n");
                }
            }
        }

        content.append("""

                ## Summary

                ## Methods

                ## Results

                ## My Thoughts
                """);
        return content.toString();
    }

    private void appendBullet(StringBuilder content, String key, String value) {
        if (isBlank(value)) return;
        content.append("- ").append(key).append(": ").append(collapse(value)).append("\n");
    }

    private String collapse(String value) {
        if (value == null) return "";
        return value.trim().replaceAll("\\s+", " ");
    }

    private String uniqueTitle(String baseTitle) {
        String sanitized = baseTitle == null || baseTitle.isBlank() ? "Untitled" : baseTitle.trim();
        String candidate = sanitized;
        int counter = 2;
        while (vaultService.titleExistsAtRoot(candidate)) {
            candidate = sanitized + " (" + counter + ")";
            counter++;
        }
        return candidate;
    }

    private boolean hasFrontmatter(String content) {
        return content != null && content.startsWith("---");
    }

    private String stripFrontmatterBody(String content) {
        if (!hasFrontmatter(content)) {
            return content == null ? "" : content;
        }
        return frontmatterService.parse(content).body();
    }

    private String blankToEmpty(String value) {
        return value == null ? "" : value;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private NoteDto toDto(Note note, boolean loadContent) {
        String content = "";
        Map<String, Object> properties = note.getProperties();
        if (loadContent && note.getPath() != null) {
            try {
                Map<String, Object> file = vaultService.readFile(note.getPath());
                content = (String) file.getOrDefault("body", "");
                properties = (Map<String, Object>) file.getOrDefault("properties", properties);
            } catch (Exception ex) {
                // Unreadable file falls back to index cache
            }
        }
        Long paperId = note.getPaperId();
        if (paperId == null && properties.get("paperId") instanceof Number number) {
            paperId = number.longValue();
        }
        return new NoteDto(
                note.getId(),
                note.getUserId(),
                note.getTitle(),
                content,
                properties,
                paperId,
                note.getCreatedAt(),
                note.getUpdatedAt(),
                note.getVersion()
        );
    }
}
