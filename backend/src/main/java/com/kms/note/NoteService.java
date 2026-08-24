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
 * Phase 4 起 NoteService 是「文件优先」的兼容层：
 *   - 真相来源 = Vault 目录下的 .md 文件（先写文件，成功后更新索引）；
 *   - legacy /api/notes/{id} 那套接口保留不删（旧页面还在用），内部全部
 *     委托给 VaultService（按 path 走、经 VaultPathResolver 校验）；
 *   - 旧 world 的 DB-only 笔记（无 path 行）已按 Phase 4 决策清空，Vault 从空库起步。
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

    /** legacy POST /api/notes → 在 Vault 根目录写 .md + 更新索引。 */
    public NoteDto create(NoteRequest request) {
        String title = request.getTitle() == null ? "" : request.getTitle().trim();
        if (title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "标题不能为空。");
        }
        Map<String, Object> properties = request.getProperties() == null
                ? new LinkedHashMap<>() : request.getProperties();
        if (request.getPaperId() != null) {
            properties.putIfAbsent("paperId", request.getPaperId());
        }
        String content = request.getContent() == null ? "" : request.getContent();
        String body = stripFrontmatterBody(content);
        // 已带 frontmatter 的正文保持原样；否则按 properties 组装
        String finalContent;
        if (hasFrontmatter(content)) {
            finalContent = content;
        } else {
            finalContent = frontmatterService.compose(properties, body);
        }
        Map<String, Object> created = vaultService.createNote("", uniqueTitle(title), finalContent);
        Note note = noteRepository.findByPath((String) created.get("path"))
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "索引行创建失败。"));
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
     * 只改正文的保存路径（Reader 右侧 Notes tab 的 800ms 自动保存走这里）。
     *
     * expectedVersion 非空时做乐观锁检查：不匹配抛 409 并带上服务端当前内容与版本，
     * 由调用方决定「保留我的 / 采用服务端 / 手动合并」—— 服务端不替用户选。
     * expectedVersion 为空 = 调用方明确放弃并发保护（agent 写工具等场景），行为同旧版。
     */
    public NoteDto updateContent(Long id, String content, Long expectedVersion) {
        Note note = findNote(id);
        if (expectedVersion != null && expectedVersion != note.getVersion()) {
            throw new ApiException(HttpStatus.CONFLICT,
                    "这篇笔记已被其他窗口保存过，直接写入会覆盖对方的修改。",
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
        // 索引器可能已经在 saveFile 里重写过这一行，所以重新取再递增版本。
        Note latest = note.getPath() == null
                ? note
                : noteRepository.findByPath(note.getPath()).orElse(note);
        latest.setVersion(note.getVersion() + 1);
        noteRepository.save(latest);
        return toDto(latest, true);
    }

    /** 取服务端当前正文（文件优先，读不到时退回索引缓存）。 */
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

    /** 公共接口：按 ID 获取笔记正文（文件优先，读不到时退回数据库缓存）。 */
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

    /** legacy PUT /api/notes/{id} → 改文件（标题变化 = 重命名文件）。 */
    public NoteDto update(Long id, NoteRequest request) {
        Note note = findNote(id);
        if (note.getPath() == null) {
            throw new ApiException(HttpStatus.GONE, "该笔记不是 Vault 文件，无法更新。");
        }
        String newTitle = request.getTitle() == null ? "" : request.getTitle().trim();
        String currentTitle = note.getTitle();
        String relPath = note.getPath();
        if (!newTitle.isBlank() && !newTitle.equals(currentTitle)) {
            // 标题变化 → 重命名文件（不自动改其他文件的引用，legacy 语义）
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
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "索引行更新失败。"));
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

    /** legacy backlinks（按标题）→ 文件版（已解析路径 + 未解析标题指向）。 */
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
                .orElseThrow(() -> new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "索引行创建失败。"));
        note.setPaperId(paperId);
        noteRepository.save(note);
        return toDto(note, true);
    }

    private void validatePath(String folder, String filename) {
        // 空字节：JVM 的 Paths.get 会抛 InvalidPathException（500），且部分底层 syscall 会在
        // \0 处截断路径 —— 必须在进入文件系统之前挡掉，并返回 400 而非 500。
        if (folder.indexOf('\0') >= 0 || filename.indexOf('\0') >= 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "非法路径: 含空字节");
        }
        // folder 同样要挡反斜杠：既防 Windows 风格绝对路径（C:\Windows），也防 ..\..\ 变体。
        if (folder.contains("..") || folder.startsWith("/") || folder.contains("\\")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "非法路径: folder");
        }
        if (filename.contains("..") || filename.contains("/") || filename.contains("\\") || filename.startsWith("/")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "非法路径: filename");
        }
    }

    private String sanitizeFilename(String title) {
        if (title == null || title.isBlank()) return "untitled";
        return title.replaceAll("[/\\\\:*?\"<>|]", "-").trim().replaceAll("^[.]+|[.]+$", "")
                .substring(0, Math.min(title.length(), 100));
    }

    private String makeUniqueFilename(String filename) {
        String base = filename.replaceAll("\\.md$", "");
        return base + "-副本-" + System.currentTimeMillis() % 10000 + ".md";
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
        content.append(isBlank(paper.getAbstractText()) ? "暂无摘要。\n" : paper.getAbstractText().trim() + "\n");

        content.append("\n## Metadata\n\n");
        if (metadata.isEmpty()) {
            content.append("暂无正式 KV metadata。\n");
        } else {
            for (PaperMetadata field : metadata) {
                appendBullet(content, field.getKey(), field.getValue());
            }
        }

        content.append("\n## AI Extraction Review\n\n");
        if (extractions.isEmpty()) {
            content.append("暂无 AI extraction 记录。\n");
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
                    content.append("  - AI 原值：").append(collapse(row.getExtractedValue())).append("\n");
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
                // 文件不可读时退回索引缓存内容
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
