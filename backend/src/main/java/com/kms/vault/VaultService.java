package com.kms.vault;

import com.kms.common.ApiException;
import com.kms.note.Note;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Vault 文件服务：写操作永远「先写文件 → 成功后更新索引 → 返回」。
 * 磁盘 .md 是唯一真相来源；写文件失败绝不更新索引。
 */
@Service
public class VaultService {
    private static final Logger log = LoggerFactory.getLogger(VaultService.class);

    private static final Set<String> IMAGE_EXTENSIONS = Set.of("png", "jpg", "jpeg", "gif", "webp", "svg", "bmp");
    private static final Pattern INVALID_FILE_CHARS = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private final VaultPathResolver pathResolver;
    private final VaultIndexService indexService;
    private final FrontmatterService frontmatterService;
    private final VaultWatchService watchService;

    public VaultService(VaultPathResolver pathResolver, VaultIndexService indexService,
                        FrontmatterService frontmatterService, VaultWatchService watchService) {
        this.pathResolver = pathResolver;
        this.indexService = indexService;
        this.frontmatterService = frontmatterService;
        this.watchService = watchService;
    }

    // ------------------------------------------------------------------
    // info / tree
    // ------------------------------------------------------------------

    public Map<String, Object> info() {
        Map<String, Object> info = new LinkedHashMap<>();
        info.put("root", pathResolver.root().toString());
        info.put("baseDirs", VaultConfig.BASE_DIRS);
        info.put("watcher", Map.of("mode", "polling", "intervalMs", watchService.intervalMs()));
        info.put("indexedNotes", watchService.indexedCount());
        return info;
    }

    /** 递归文件树（排除 .DS_Store 等系统文件）。 */
    public Map<String, Object> tree() {
        Map<String, Object> root = new LinkedHashMap<>();
        root.put("name", pathResolver.root().getFileName().toString());
        root.put("path", "");
        root.put("type", "folder");
        root.put("children", listChildren(pathResolver.root()));
        return root;
    }

    private List<Map<String, Object>> listChildren(Path dir) {
        List<Map<String, Object>> children = new ArrayList<>();
        try (var stream = Files.list(dir)) {
            List<Path> entries = stream
                    .filter(path -> !Files.isSymbolicLink(path))
                    .filter(path -> !path.getFileName().toString().equals(".DS_Store"))
                    .sorted(Comparator.comparing(path -> path.getFileName().toString().toLowerCase(Locale.ROOT)))
                    .toList();
            for (Path entry : entries) {
                Map<String, Object> node = new LinkedHashMap<>();
                String name = entry.getFileName().toString();
                node.put("name", name);
                node.put("path", pathResolver.toRelative(entry));
                node.put("mtime", entry.toFile().lastModified());
                try {
                    node.put("ctime", Files.readAttributes(entry, java.nio.file.attribute.BasicFileAttributes.class)
                            .creationTime().toMillis());
                } catch (IOException ignored) {
                }
                if (Files.isDirectory(entry)) {
                    node.put("type", "folder");
                    node.put("children", listChildren(entry));
                } else {
                    node.put("type", typeOf(name));
                }
                children.add(node);
            }
        } catch (IOException ex) {
            throw new IllegalStateException("读取目录失败: " + dir, ex);
        }
        return children;
    }

    private String typeOf(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".md")) return "md";
        if (lower.endsWith(".canvas")) return "canvas";
        if (lower.endsWith(".pdf")) return "pdf";
        String ext = lower.contains(".") ? lower.substring(lower.lastIndexOf('.') + 1) : "";
        if (IMAGE_EXTENSIONS.contains(ext)) return "image";
        return "other";
    }

    // ------------------------------------------------------------------
    // 读取 / 保存
    // ------------------------------------------------------------------

    public Map<String, Object> readFile(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        Map<String, Object> result = new LinkedHashMap<>();
        FrontmatterService.ParsedFrontmatter parsed;
        String rawContent;
        try {
            rawContent = Files.readString(real, StandardCharsets.UTF_8);
            parsed = frontmatterService.parse(rawContent);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "读取文件失败: " + relPath);
        }
        result.put("path", relPath);
        result.put("title", WikiLinkParser.noteNameOf(real.getFileName().toString()));
        result.put("content", rawContent);           // 原始文本，编辑器唯一输入
        result.put("body", parsed.body());           // 去掉 frontmatter 的正文
        result.put("properties", parsed.data());
        result.put("frontmatterValid", parsed.valid());
        result.put("mtime", real.toFile().lastModified());
        return result;
    }

    /**
     * 保存（带 mtime 冲突检测）。返回 {path,mtime,saved}。
     * 磁盘版本已被外部修改时返回 409 + conflict:true + serverContent，
     * 绝不静默覆盖。
     */
    public Map<String, Object> saveFile(String relPath, String content, Long baseMtime) {
        Path real = pathResolver.resolveExisting(relPath);
        if (content == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "content 不能为空。");
        }
        long currentMtime = real.toFile().lastModified();
        if (baseMtime != null && baseMtime > 0 && currentMtime > baseMtime) {
            String serverContent;
            try {
                serverContent = Files.readString(real, StandardCharsets.UTF_8);
            } catch (IOException ex) {
                serverContent = "";
            }
            throw new ApiException(HttpStatus.CONFLICT,
                    "文件已被外部修改，请先查看差异再决定覆盖或放弃。",
                    Map.of("conflict", true, "serverContent", serverContent, "serverMtime", currentMtime));
        }
        writeFileAndIndex(real, content);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("mtime", real.toFile().lastModified());
        result.put("saved", true);
        return result;
    }

    /** 写文件 → 成功后更新索引（唯一写盘入口）。 */
    private void writeFileAndIndex(Path real, String content) {
        try {
            Files.createDirectories(real.getParent());
            Files.writeString(real, content, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "写入文件失败: " + real);
        }
        indexService.indexFile(real);
        // 刷新轮询快照，避免扫描器对本请求刚写入的文件做重复索引
        watchService.refreshStamp(real);
        log.info("[Vault] saved: {}", pathResolver.toRelative(real));
    }

    // ------------------------------------------------------------------
    // 新建 / 重命名 / 移动 / 删除
    // ------------------------------------------------------------------

    public Map<String, Object> createNote(String parentPath, String title, String content) {
        String name = title == null ? "" : title.trim();
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "标题不能为空。");
        }
        String fileName = sanitizeFileName(name) + ".md";
        String dirRel = parentPath == null || parentPath.isBlank() ? "" : parentPath;
        Path dir = dirRel.isEmpty() ? pathResolver.root() : pathResolver.resolveDir(dirRel);
        Path file = dir.resolve(fileName);
        if (Files.exists(file)) {
            throw new ApiException(HttpStatus.CONFLICT, "同名文件已存在: " + fileName);
        }
        String body = content == null ? "" : content;
        String finalContent = body.isBlank() ? "# " + name + "\n" : body;
        writeFileAndIndex(file, finalContent);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", pathResolver.toRelative(file));
        result.put("title", name);
        result.put("mtime", file.toFile().lastModified());
        return result;
    }

    public Map<String, Object> createFolder(String parentPath, String name) {
        String folderName = name == null ? "" : name.trim();
        if (folderName.isBlank() || INVALID_FILE_CHARS.matcher(folderName).find()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "文件夹名不合法。");
        }
        String dirRel = parentPath == null || parentPath.isBlank() ? "" : parentPath;
        Path parent = dirRel.isEmpty() ? pathResolver.root() : pathResolver.resolveDir(dirRel);
        Path folder = parent.resolve(folderName);
        if (Files.exists(folder)) {
            throw new ApiException(HttpStatus.CONFLICT, "同名文件夹已存在。");
        }
        try {
            Files.createDirectories(folder);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "创建文件夹失败。");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", pathResolver.toRelative(folder));
        return result;
    }

    /**
     * 重命名（Obsidian 关键行为）：扫描所有引用 [[旧标题]] 的笔记，
     * updateReferences=true 时批量改写为 [[新标题]] 并同步更新索引。
     */
    public Map<String, Object> rename(String relPath, String newName, boolean updateReferences) {
        Path real = pathResolver.resolveExisting(relPath);
        String oldTitle = WikiLinkParser.noteNameOf(real.getFileName().toString());
        String newTitle = newName == null ? "" : newName.trim();
        if (newTitle.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "新名称不能为空。");
        }
        if (newTitle.equals(oldTitle)) {
            throw new ApiException(HttpStatus.CONFLICT, "新名称与原名称相同。");
        }
        Path parent = real.getParent();
        String ext = real.getFileName().toString().contains(".")
                ? real.getFileName().toString().substring(real.getFileName().toString().lastIndexOf('.'))
                : "";
        Path target = parent.resolve(sanitizeFileName(newTitle) + ext);
        if (Files.exists(target)) {
            throw new ApiException(HttpStatus.CONFLICT, "同名文件已存在: " + target.getFileName());
        }
        // 先改文件（真相来源），成功后改索引
        try {
            Files.move(real, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "重命名失败。");
        }
        String oldRel = relPath;
        String newRel = pathResolver.toRelative(target);
        indexService.removeIndex(oldRel);
        indexService.indexFile(target);

        List<String> updated = new ArrayList<>();
        if (updateReferences) {
            updated = updateReferences(oldTitle, newTitle, newRel);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", newRel);
        result.put("title", newTitle);
        result.put("updatedReferences", updated);
        result.put("referencesUpdated", updated.size());
        return result;
    }

    /** 批量改写引用：写文件在前，索引更新在后，逐个失败不中断。 */
    private List<String> updateReferences(String oldTitle, String newTitle, String renamedPath) {
        List<String> updated = new ArrayList<>();
        Pattern pattern = Pattern.compile("\\[\\[" + Pattern.quote(oldTitle) + "(?=[#\\]|])");
        for (Note note : indexService.allIndexedNotes()) {
            String rel = note.getPath();
            if (rel == null || rel.equals(renamedPath)) {
                continue;
            }
            try {
                Path file = pathResolver.resolveExisting(rel);
                String content = Files.readString(file, StandardCharsets.UTF_8);
                Matcher matcher = pattern.matcher(content);
                if (!matcher.find()) {
                    continue;
                }
                String rewritten = content.replaceAll(
                        "\\[\\[" + Pattern.quote(oldTitle) + "(?=[#\\]|])", "[[" + newTitle);
                Files.writeString(file, rewritten, StandardCharsets.UTF_8);
                indexService.indexFile(file);
                updated.add(rel);
            } catch (Exception ex) {
                log.warn("[Vault] 更新引用失败: {} ({})", rel, ex.getMessage());
            }
        }
        return updated;
    }

    public Map<String, Object> move(String relPath, String targetDirRel) {
        Path real = pathResolver.resolveExisting(relPath);
        String fileName = real.getFileName().toString();
        String dirRel = targetDirRel == null || targetDirRel.isBlank() ? "" : targetDirRel;
        Path targetDir = dirRel.isEmpty() ? pathResolver.root() : pathResolver.resolveDir(dirRel);
        Path target = targetDir.resolve(fileName);
        if (Files.exists(target)) {
            throw new ApiException(HttpStatus.CONFLICT, "目标目录已存在同名文件。");
        }
        try {
            Files.createDirectories(targetDir);
            Files.move(real, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "移动失败。");
        }
        String newRel = pathResolver.toRelative(target);
        indexService.removeIndex(relPath);
        indexService.indexFile(target);
        indexService.updateLinkTargetPaths(relPath, newRel);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", newRel);
        return result;
    }

    public void delete(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        if (Files.isDirectory(real)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "请用文件树的目录操作删除文件夹。");
        }
        try {
            Files.delete(real);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "删除失败。");
        }
        indexService.removeIndex(relPath);
        log.info("[Vault] deleted: {}", relPath);
    }

    /** 递归删除文件夹（禁止删除 Vault 根；真路径经 resolver 校验后删除）。 */
    public void deleteFolder(String relPath) {
        if (relPath == null || relPath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "不能删除 Vault 根目录。");
        }
        Path real = pathResolver.resolveDir(relPath);
        if (real.equals(pathResolver.root())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "不能删除 Vault 根目录。");
        }
        try (var stream = Files.walk(real)) {
            stream.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    if (path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md")) {
                        indexService.removeIndex(pathResolver.toRelative(path));
                    }
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    log.warn("[Vault] 删除文件夹条目失败: {}", path);
                }
            });
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "删除文件夹失败。");
        }
        log.info("[Vault] folder deleted: {}", relPath);
    }

    /** 读取 Vault 内任意已存在文件（附件预览用；只读）。 */
    /**
     * 保存附件到 Attachments/（Obsidian 的默认附件目录约定）。
     *
     * 此前整个项目除论文 PDF 外没有任何上传入口 —— 白名单允许写 Attachments/ 下的图片，
     * 但根本没有办法把图片弄进去，等于形同虚设。
     *
     * 同名文件不覆盖，追加 -1 / -2 后缀：附件是被 [[嵌入]] 引用的，
     * 覆盖会让别的笔记里的图悄悄换成另一张。
     *
     * @return 相对路径，例如 Attachments/figure-1.png
     */
    public Map<String, Object> saveAttachment(String originalName, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件内容为空。");
        }
        String raw = originalName == null || originalName.isBlank() ? "attachment" : originalName;
        // 只取文件名部分，挡掉调用方传来的任何目录成分。
        int slash = Math.max(raw.lastIndexOf('/'), raw.lastIndexOf('\\'));
        if (slash >= 0) raw = raw.substring(slash + 1);
        int dot = raw.lastIndexOf('.');
        String base = sanitizeFileName(dot > 0 ? raw.substring(0, dot) : raw);
        String ext = dot > 0 ? raw.substring(dot).toLowerCase() : "";

        String relPath = "Attachments/" + base + ext;
        int seq = 1;
        while (Files.exists(pathResolver.root().resolve(relPath))) {
            relPath = "Attachments/" + base + "-" + seq + ext;
            seq++;
        }

        // 经 resolveForWrite 走完整的穿越校验 + 扩展名白名单。
        Path real = pathResolver.resolveForWrite(relPath);
        try {
            Files.createDirectories(real.getParent());
            Files.write(real, bytes);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "写入附件失败: " + relPath);
        }
        watchService.refreshStamp(real);
        log.info("[Vault] attachment saved: {} ({} bytes)", relPath, bytes.length);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("name", base + ext);
        result.put("size", bytes.length);
        // embed 是可直接插进 Markdown 的 Obsidian 嵌入语法。
        result.put("embed", "![[" + base + ext + "]]");
        return result;
    }

    public byte[] readRaw(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        try {
            return Files.readAllBytes(real);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "读取文件失败。");
        }
    }

    private String sanitizeFileName(String name) {
        String sanitized = INVALID_FILE_CHARS.matcher(name.trim()).replaceAll("_");
        return sanitized.isBlank() ? "Untitled" : sanitized;
    }

    /** Vault 根目录下是否已存在同名笔记文件（legacy uniqueTitle 用）。 */
    public boolean titleExistsAtRoot(String title) {
        return Files.exists(pathResolver.root().resolve(sanitizeFileName(title) + ".md"));
    }

    /** 属性面板写回：更新 frontmatter（其余正文不动）。 */
    public Map<String, Object> saveProperties(String relPath, Map<String, Object> properties, Long baseMtime) {
        Path real = pathResolver.resolveExisting(relPath);
        long currentMtime = real.toFile().lastModified();
        if (baseMtime != null && baseMtime > 0 && currentMtime > baseMtime) {
            throw new ApiException(HttpStatus.CONFLICT, "文件已被外部修改，请刷新后重试。");
        }
        FrontmatterService.ParsedFrontmatter parsed;
        try {
            parsed = frontmatterService.parse(Files.readString(real, StandardCharsets.UTF_8));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "读取文件失败。");
        }
        if (!parsed.valid()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "当前 frontmatter 解析失败，请先手动修正 YAML 再编辑属性。");
        }
        writeFileAndIndex(real, frontmatterService.compose(properties, parsed.body()));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("mtime", real.toFile().lastModified());
        result.put("saved", true);
        return result;
    }
}
