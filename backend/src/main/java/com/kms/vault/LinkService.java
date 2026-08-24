package com.kms.vault;

import com.kms.common.ApiException;
import com.kms.note.Note;
import com.kms.note.NoteLink;
import com.kms.note.NoteLinkRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 双链查询：Backlinks / Outgoing / Unlinked mentions / 建立链接。
 * Linked 走 note_links 索引；Unlinked 用 tsvector 候选 + 读文件逐字验证
 * （标题的纯文本出现且未被 [[]] 包裹）。
 */
@Service
public class LinkService {

    private final NoteLinkRepository linkRepository;
    private final VaultIndexService indexService;
    private final VaultPathResolver pathResolver;

    public LinkService(NoteLinkRepository linkRepository, VaultIndexService indexService,
                       VaultPathResolver pathResolver) {
        this.linkRepository = linkRepository;
        this.indexService = indexService;
        this.pathResolver = pathResolver;
    }

    public List<Map<String, Object>> outgoing(String relPath) {
        pathResolver.resolveExisting(relPath); // 校验
        List<Map<String, Object>> rows = new ArrayList<>();
        for (NoteLink link : linkRepository.findBySourcePath(relPath)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("targetTitle", link.getTargetTitle());
            row.put("targetPath", link.getTargetPath());
            row.put("targetRaw", link.getTargetRaw());
            row.put("alias", link.getAlias());
            row.put("resolved", link.isResolved());
            rows.add(row);
        }
        return rows;
    }

    /** Linked mentions：target = 当前笔记（已解析路径 + 未解析但标题指向本笔记）。 */
    public List<Map<String, Object>> backlinks(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        String title = WikiLinkParser.noteNameOf(real.getFileName().toString());
        Map<String, Map<String, Object>> bySource = new LinkedHashMap<>();
        for (NoteLink link : linkRepository.findByTargetPath(relPath)) {
            bySource.put(link.getSourcePath(), mentionRow(link.getSourcePath(), link.getTargetTitle(), title));
        }
        for (NoteLink link : linkRepository.findByTargetTitleAndResolvedFalse(title)) {
            bySource.putIfAbsent(link.getSourcePath(), mentionRow(link.getSourcePath(), link.getTargetTitle(), title));
        }
        return new ArrayList<>(bySource.values());
    }

    private Map<String, Object> mentionRow(String sourcePath, String targetTitle, String currentTitle) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("path", sourcePath);
        row.put("title", sourcePath == null ? "" : WikiLinkParser.noteNameOf(sourcePath.substring(sourcePath.lastIndexOf('/') + 1)));
        row.put("snippet", snippetAround(sourcePath, "[[" + (targetTitle == null ? currentTitle : targetTitle)));
        return row;
    }

    /** Unlinked mentions：标题纯文本出现且未被 [[]] 包裹（读文件验证）。 */
    public List<Map<String, Object>> unlinked(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        String title = WikiLinkParser.noteNameOf(real.getFileName().toString());
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Note> candidates = indexService.searchByTitleTokens(title);
        Pattern linkedForm = Pattern.compile("\\[\\[" + Pattern.quote(title) + "(?:[#\\]|])");
        Pattern mentionForm = Pattern.compile("(?<!\\[)" + Pattern.quote(title));
        for (Note note : candidates) {
            String rel = note.getPath();
            if (rel == null || rel.equals(relPath)) {
                continue;
            }
            try {
                String content = Files.readString(pathResolver.resolveExisting(rel), StandardCharsets.UTF_8);
                Matcher linked = linkedForm.matcher(content);
                if (linked.find()) {
                    continue; // 已有 [[]] 链接，不算 unlinked
                }
                Matcher mention = mentionForm.matcher(content);
                if (!mention.find()) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("path", rel);
                row.put("title", note.getTitle());
                row.put("snippet", snippetAround(rel, title));
                rows.add(row);
            } catch (IOException | ApiException ex) {
                // 跳过不可读文件
            }
        }
        return rows;
    }

    /** 「建立链接」：把源文件中第一处纯文本标题改写为 [[标题]]（先写文件再更新索引）。 */
    public Map<String, Object> createLink(String sourcePath, String targetTitle) {
        Path real = pathResolver.resolveExisting(sourcePath);
        String target = targetTitle == null ? "" : targetTitle.trim();
        if (target.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "targetTitle 不能为空。");
        }
        String content;
        try {
            content = Files.readString(real, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "读取文件失败。");
        }
        Pattern linkedForm = Pattern.compile("\\[\\[" + Pattern.quote(target) + "(?:[#\\]|])");
        if (linkedForm.matcher(content).find()) {
            throw new ApiException(HttpStatus.CONFLICT, "该笔记已存在指向此标题的链接。");
        }
        Pattern mentionForm = Pattern.compile("(?<!\\[)" + Pattern.quote(target));
        Matcher matcher = mentionForm.matcher(content);
        if (!matcher.find()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "源文件中没有该标题的纯文本出现。");
        }
        String rewritten = content.substring(0, matcher.start()) + "[[" + target + "]]" + content.substring(matcher.end());
        try {
            Files.writeString(real, rewritten, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "写入文件失败。");
        }
        indexService.indexFile(real);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetTitle", target);
        result.put("linked", true);
        return result;
    }

    /** 在源文件中截取关键词附近的上下文（供 Backlinks 展示）。 */
    private String snippetAround(String relPath, String needle) {
        if (relPath == null || needle == null) {
            return "";
        }
        try {
            String content = Files.readString(pathResolver.resolveExisting(relPath), StandardCharsets.UTF_8);
            int idx = content.toLowerCase(Locale.ROOT).indexOf(needle.toLowerCase(Locale.ROOT));
            if (idx < 0) {
                return content.length() > 60 ? content.substring(0, 60) + "…" : content;
            }
            int from = Math.max(0, idx - 30);
            int to = Math.min(content.length(), idx + needle.length() + 50);
            return (from > 0 ? "…" : "") + content.substring(from, to).replace("\n", " ") + (to < content.length() ? "…" : "");
        } catch (Exception ex) {
            return "";
        }
    }
}
