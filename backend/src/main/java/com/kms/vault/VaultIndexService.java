package com.kms.vault;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.note.Note;
import com.kms.note.NoteLink;
import com.kms.note.NoteLinkRepository;
import com.kms.note.NoteProperty;
import com.kms.note.NotePropertyRepository;
import com.kms.note.NoteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Vault 索引缓存服务。notes / note_links / note_properties 全部是磁盘 .md 的
 * 索引缓存，可随时清空后由 {@link #reindexAll()} 全量重建 —— 不丢任何数据。
 *
 * 索引行不存全文正文（notes.content 置空），全文搜索走 PostgreSQL tsvector。
 * 由于 Postgres 'simple' parser 不切分 CJK，这里在 Java 侧把中文按二字组
 * （bigram）切分后再交给 to_tsvector/to_tsquery，保证中文搜索可用。
 */
@Service
public class VaultIndexService {
    private static final Logger log = LoggerFactory.getLogger(VaultIndexService.class);

    private final NoteRepository noteRepository;
    private final NoteLinkRepository linkRepository;
    private final NotePropertyRepository propertyRepository;
    private final VaultPathResolver pathResolver;
    private final FrontmatterService frontmatterService;
    private final WikiLinkParser wikiLinkParser;
    private final ObjectMapper objectMapper;

    public VaultIndexService(NoteRepository noteRepository, NoteLinkRepository linkRepository,
                             NotePropertyRepository propertyRepository, VaultPathResolver pathResolver,
                             FrontmatterService frontmatterService, WikiLinkParser wikiLinkParser,
                             ObjectMapper objectMapper) {
        this.noteRepository = noteRepository;
        this.linkRepository = linkRepository;
        this.propertyRepository = propertyRepository;
        this.pathResolver = pathResolver;
        this.frontmatterService = frontmatterService;
        this.wikiLinkParser = wikiLinkParser;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------------
    // 单个文件索引
    // ------------------------------------------------------------------

    /** 索引单个已存在文件（读取 → 解析 → upsert → 重建 properties/links）。
     *  synchronized：轮询扫描器与本请求线程可能同时索引同一文件，
     *  必须串行避免 delete/insert 交错触发唯一约束冲突。 */
    @Transactional
    public synchronized Note indexFile(Path realPath) {
        String relPath = pathResolver.toRelative(realPath);
        String content;
        try {
            content = Files.readString(realPath, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new IllegalStateException("读取文件失败: " + relPath, ex);
        }
        long mtime = realPath.toFile().lastModified();
        String hash = sha256(content);
        String fileName = realPath.getFileName().toString();
        String title = WikiLinkParser.noteNameOf(fileName);

        FrontmatterService.ParsedFrontmatter parsed = frontmatterService.parse(content);
        Map<String, Object> properties = parsed.data();

        Note note = noteRepository.findByPath(relPath).orElseGet(Note::new);
        note.setUserId(1L);
        note.setTitle(title);
        note.setContent(""); // 索引不存全文正文（真相来源是文件）
        note.setProperties(properties);
        note.setPath(relPath);
        note.setMtime(mtime);
        note.setContentHash(hash);
        note.setIndexedAt(OffsetDateTime.now());
        // frontmatter 里的 paperId 同步到 paper_id 列（Phase 6 打通用）
        if (properties.get("paperId") instanceof Number number) {
            note.setPaperId(number.longValue());
        }
        Note saved = noteRepository.save(note);

        // tsvector：中文 bigram + 拉丁 token 混排，标题加权
        String tokens = toTsTokens(title) + " " + toTsTokens(content);
        noteRepository.updateSearchVector(saved.getId(), tokens);

        rebuildProperties(saved, properties);
        rebuildLinksForNote(saved, content);
        // 本文件出现后，其他笔记指向本标题的未解析链接自动解析（Obsidian 行为）
        linkRepository.resolveTitleToPath(title, relPath);
        return saved;
    }

    private void rebuildProperties(Note note, Map<String, Object> properties) {
        propertyRepository.deleteByNoteId(note.getId());
        propertyRepository.flush(); // 强制先 DELETE 后 INSERT（Hibernate flush 默认 INSERT 在前，会撞唯一键）
        if (properties.isEmpty()) {
            return;
        }
        List<NoteProperty> rows = new ArrayList<>();
        properties.forEach((key, value) -> {
            NoteProperty row = new NoteProperty();
            row.setNoteId(note.getId());
            row.setKey(key);
            row.setValue(serializeValue(value));
            row.setValueType(frontmatterService.typeOf(value));
            rows.add(row);
        });
        propertyRepository.saveAll(rows);
    }

    private void rebuildLinksForNote(Note note, String content) {
        linkRepository.deleteBySourceNoteId(note.getId());
        linkRepository.flush(); // 同上：先 DELETE 后 INSERT
        List<WikiLinkParser.WikiLink> links = wikiLinkParser.parse(content);
        if (links.isEmpty()) {
            return;
        }
        Map<String, String> titleToPath = titleToPathMap(note.getPath());
        List<NoteLink> rows = new ArrayList<>();
        for (WikiLinkParser.WikiLink link : links) {
            String targetTitle = link.targetTitle();
            String targetPath = titleToPath.get(targetTitle.toLowerCase(Locale.ROOT));
            NoteLink row = new NoteLink();
            row.setSourceNoteId(note.getId());
            row.setSourcePath(note.getPath());
            row.setTargetTitle(targetTitle);
            row.setTargetRaw(link.targetRaw());
            row.setAlias(link.alias());
            row.setTargetPath(targetPath);
            row.setResolved(targetPath != null);
            rows.add(row);
        }
        linkRepository.saveAll(rows);
    }

    /** 标题(小写) → 相对路径。当前文件自己也在其中（自链允许，Graph 里可显示）。 */
    private Map<String, String> titleToPathMap(String excludePath) {
        Map<String, String> map = new HashMap<>();
        for (Note note : noteRepository.findAllIndexed()) {
            if (note.getPath() != null && !note.getPath().equals(excludePath)) {
                map.putIfAbsent(note.getTitle().toLowerCase(Locale.ROOT), note.getPath());
            }
        }
        return map;
    }

    // ------------------------------------------------------------------
    // 删除 / 全量重建
    // ------------------------------------------------------------------

    @Transactional
    public void removeIndex(String relPath) {
        Note note = noteRepository.findByPath(relPath).orElse(null);
        if (note == null) {
            return;
        }
        linkRepository.deleteBySourceNoteId(note.getId());
        propertyRepository.deleteByNoteId(note.getId());
        noteRepository.delete(note);
        log.info("[Vault] index removed: {}", relPath);
    }

    /**
     * 全量重建：按 path 原地 upsert，保留仍存在笔记的数据库 ID。
     *
     * notes 是磁盘文件的索引缓存，但 ID 仍被 AI 上下文、搜索结果和打开的页面引用。
     * 旧实现先清空再重建，导致每次 reindex 后所有 ID 改变，已有深链全部失效。
     * 现在先删除磁盘上已经不存在的行，再逐文件重建 properties / links / search_vector。
     * synchronized：与 indexFile / 轮询扫描串行，避免删除与重建交错。
     */
    @Transactional
    public synchronized Map<String, Object> reindexAll() {
        long start = System.currentTimeMillis();
        List<Path> mdFiles = new ArrayList<>();
        try (var stream = Files.walk(pathResolver.root())) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
                    .forEach(mdFiles::add);
        } catch (IOException ex) {
            throw new IllegalStateException("扫描 Vault 失败", ex);
        }

        Set<String> diskPaths = new LinkedHashSet<>();
        for (Path file : mdFiles) {
            diskPaths.add(pathResolver.toRelative(file));
        }
        List<String> stalePaths = noteRepository.findAllIndexed().stream()
                .map(Note::getPath)
                .filter(path -> path != null && !diskPaths.contains(path))
                .toList();
        for (String stalePath : stalePaths) {
            removeIndex(stalePath);
        }

        int notes = 0;
        for (Path file : mdFiles) {
            try {
                indexFile(file);
                notes++;
            } catch (Exception ex) {
                log.warn("[Vault] 索引失败，跳过: {} ({})", file, ex.getMessage());
            }
        }
        long duration = System.currentTimeMillis() - start;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mdFiles", mdFiles.size());
        result.put("notes", notes);
        result.put("links", linkRepository.count());
        result.put("properties", propertyRepository.count());
        result.put("removed", stalePaths.size());
        result.put("durationMs", duration);
        log.info("[Vault] reindex done: {} md files, {} notes, {}ms", mdFiles.size(), notes, duration);
        return result;
    }

    // ------------------------------------------------------------------
    // 查询（索引只用于搜索/反链/图/表格，正文读文件）
    // ------------------------------------------------------------------

    public List<Map<String, Object>> search(String q) {
        String query = q == null ? "" : q.trim();
        List<Note> hits;
        if (query.isEmpty()) {
            hits = noteRepository.findAllIndexed().stream().limit(50).toList();
        } else {
            hits = noteRepository.searchByTsvector(toTsQueryTokens(query));
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (Note note : hits) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", note.getId());
            row.put("path", note.getPath());
            row.put("title", note.getTitle());
            row.put("mtime", note.getMtime());
            row.put("snippet", snippetFor(note.getPath(), query));
            results.add(row);
        }
        return results;
    }

    private String snippetFor(String relPath, String query) {
        if (relPath == null) {
            return "";
        }
        try {
            String content = Files.readString(pathResolver.resolveExisting(relPath), StandardCharsets.UTF_8);
            String haystack = content.toLowerCase(Locale.ROOT);
            String needle = query.toLowerCase(Locale.ROOT);
            int idx = haystack.indexOf(needle);
            if (idx < 0 && query.length() >= 2) {
                idx = haystack.indexOf(needle.substring(0, 2)); // CJK bigram 首词
            }
            if (idx < 0) {
                return content.length() > 80 ? content.substring(0, 80) + "…" : content;
            }
            int from = Math.max(0, idx - 40);
            int to = Math.min(content.length(), idx + query.length() + 60);
            return (from > 0 ? "…" : "") + content.substring(from, to).replace("\n", " ") + (to < content.length() ? "…" : "");
        } catch (Exception ex) {
            return "";
        }
    }

    /** 移动文件后更新指向旧路径的入链。 */
    @Transactional
    public void updateLinkTargetPaths(String oldPath, String newPath) {
        linkRepository.updateTargetPath(oldPath, newPath);
    }

    /** 聚合全部 Properties key（Database View 列）。 */
    public List<String> aggregatePropertyKeys() {
        return propertyRepository.findAll().stream().map(NoteProperty::getKey).distinct().sorted().toList();
    }

    public List<Note> allIndexedNotes() {
        return noteRepository.findAllIndexed();
    }

    /** 用标题 token 找候选笔记（Unlinked mentions 候选集）。 */
    public List<Note> searchByTitleTokens(String title) {
        String query = toTsQueryTokens(title);
        if (query.isBlank()) {
            return List.of();
        }
        return noteRepository.searchByTsvector(query);
    }

    public long indexedCount() {
        return noteRepository.findAllIndexed().size();
    }

    /** Database View 行数据：所有笔记的 frontmatter Properties + 基础字段。 */
    public List<Map<String, Object>> tableRows() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Note note : noteRepository.findAllIndexed()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("path", note.getPath());
            row.put("title", note.getTitle());
            row.put("folder", folderOf(note.getPath()));
            row.put("mtime", note.getMtime());
            Map<String, Object> properties = note.getProperties();
            properties.forEach(row::putIfAbsent);
            row.put("properties", properties);
            rows.add(row);
        }
        return rows;
    }

    public String folderOf(String relPath) {
        if (relPath == null) {
            return "";
        }
        int slash = relPath.lastIndexOf('/');
        return slash > 0 ? relPath.substring(0, slash) : "";
    }

    // ------------------------------------------------------------------
    // tsvector 中文 bigram 处理
    // ------------------------------------------------------------------

    /** CJK 连续段按二字组切分，其余 token（字母/数字）原样保留。 */
    static String toTsTokens(String text) {
        if (text == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        Matcher cjk = Pattern.compile("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}]+").matcher(text);
        int last = 0;
        while (cjk.find()) {
            out.append(text, last, cjk.start()).append(' ');
            String run = cjk.group();
            if (run.length() == 1) {
                out.append(run).append(' ');
            } else {
                for (int i = 0; i <= run.length() - 2; i++) {
                    out.append(run, i, i + 2).append(' ');
                }
            }
            last = cjk.end();
        }
        out.append(text, last, text.length());
        String result = out.toString().replaceAll("[^\\p{L}\\p{N}_]+", " ").trim();
        return result;
    }

    static String toTsQueryTokens(String query) {
        String tokens = toTsTokens(query);
        if (tokens.isBlank()) {
            return "";
        }
        String[] parts = tokens.trim().split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (out.length() > 0) {
                out.append(" & ");
            }
            out.append(part).append(":*");
        }
        return out.toString();
    }

    private String serializeValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return String.valueOf(value);
        }
    }

    private String sha256(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            return "";
        }
    }
}
