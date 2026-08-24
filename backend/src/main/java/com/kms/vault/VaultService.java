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
 * Vault File Service: Write ops always"Write file first -> Update index on success -> Back". 
 * Disk .md is sole source of truth; File write failure never updates index. 
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

    /** Recursive File Tree(Exclude .DS_Store etc systemFile).  */
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
            throw new IllegalStateException("Read dir failed: " + dir, ex);
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
    // Read / Save
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
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Read file failed: " + relPath);
        }
        result.put("path", relPath);
        result.put("title", WikiLinkParser.noteNameOf(real.getFileName().toString()));
        result.put("content", rawContent);           // Raw Text, Editor Unique Input
        result.put("body", parsed.body());           // Remove frontmatter body
        result.put("properties", parsed.data());
        result.put("frontmatterValid", parsed.valid());
        result.put("mtime", real.toFile().lastModified());
        return result;
    }

    /**
     * Save(with mtime Conflict Detection). Back {path,mtime,saved}. 
     * Return when disk modified externally 409 + conflict:true + serverContent, 
     * Never silently overwrite. 
     */
    public Map<String, Object> saveFile(String relPath, String content, Long baseMtime) {
        Path real = pathResolver.resolveExisting(relPath);
        if (content == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "content cannot beEmpty. ");
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
                    "File modified externally, View diff before overwrite or discard. ",
                    Map.of("conflict", true, "serverContent", serverContent, "serverMtime", currentMtime));
        }
        writeFileAndIndex(real, content);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("mtime", real.toFile().lastModified());
        result.put("saved", true);
        return result;
    }

    /** Write File -> Update index on success(uniqueOnewrite entry).  */
    private void writeFileAndIndex(Path real, String content) {
        try {
            Files.createDirectories(real.getParent());
            Files.writeString(real, content, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Write file failed: " + real);
        }
        indexService.indexFile(real);
        // Refresh poll snapshot, Avoid scanner reindexing just-written file
        watchService.refreshStamp(real);
        log.info("[Vault] saved: {}", pathResolver.toRelative(real));
    }

    // ------------------------------------------------------------------
    // New / Rename / Move / Delete
    // ------------------------------------------------------------------

    public Map<String, Object> createNote(String parentPath, String title, String content) {
        String name = title == null ? "" : title.trim();
        if (name.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Title cannot be empty. ");
        }
        String fileName = sanitizeFileName(name) + ".md";
        String dirRel = parentPath == null || parentPath.isBlank() ? "" : parentPath;
        Path dir = dirRel.isEmpty() ? pathResolver.root() : pathResolver.resolveDir(dirRel);
        Path file = dir.resolve(fileName);
        if (Files.exists(file)) {
            throw new ApiException(HttpStatus.CONFLICT, "Same-name file exists: " + fileName);
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
            throw new ApiException(HttpStatus.BAD_REQUEST, "Folder name invalid. ");
        }
        String dirRel = parentPath == null || parentPath.isBlank() ? "" : parentPath;
        Path parent = dirRel.isEmpty() ? pathResolver.root() : pathResolver.resolveDir(dirRel);
        Path folder = parent.resolve(folderName);
        if (Files.exists(folder)) {
            throw new ApiException(HttpStatus.CONFLICT, "Same-name folder exists. ");
        }
        try {
            Files.createDirectories(folder);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "CreateFolderFailed. ");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", pathResolver.toRelative(folder));
        return result;
    }

    /**
     * Rename(Obsidian Key Behavior): Scan all references [[Old Title]]  Note, 
     * updateReferences=true whenBatchrewrite to [[NewTitle]] and sync update index. 
     */
    public Map<String, Object> rename(String relPath, String newName, boolean updateReferences) {
        Path real = pathResolver.resolveExisting(relPath);
        String oldTitle = WikiLinkParser.noteNameOf(real.getFileName().toString());
        String newTitle = newName == null ? "" : newName.trim();
        if (newTitle.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "New name cannot be empty. ");
        }
        if (newTitle.equals(oldTitle)) {
            throw new ApiException(HttpStatus.CONFLICT, "New name same as old. ");
        }
        Path parent = real.getParent();
        String ext = real.getFileName().toString().contains(".")
                ? real.getFileName().toString().substring(real.getFileName().toString().lastIndexOf('.'))
                : "";
        Path target = parent.resolve(sanitizeFileName(newTitle) + ext);
        if (Files.exists(target)) {
            throw new ApiException(HttpStatus.CONFLICT, "Same-name file exists: " + target.getFileName());
        }
        // Change file first(Source of Truth), Update index on success
        try {
            Files.move(real, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Rename failed. ");
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

    /** Batch rewrite references: Write file first, Index update after, Per-item failure does not break.  */
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
                log.warn("[Vault] Update reference failed: {} ({})", rel, ex.getMessage());
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
            throw new ApiException(HttpStatus.CONFLICT, "Target dir has same-name file. ");
        }
        try {
            Files.createDirectories(targetDir);
            Files.move(real, target, StandardCopyOption.ATOMIC_MOVE);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Move failed. ");
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
            throw new ApiException(HttpStatus.BAD_REQUEST, "Use file tree dir ops to delete folder. ");
        }
        try {
            Files.delete(real);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Delete failed. ");
        }
        indexService.removeIndex(relPath);
        log.info("[Vault] deleted: {}", relPath);
    }

    /** Recursive Delete Folder(Forbid Delete Vault Root; truePathvia resolver after checkDelete).  */
    public void deleteFolder(String relPath) {
        if (relPath == null || relPath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot Delete Vault Root Dir. ");
        }
        Path real = pathResolver.resolveDir(relPath);
        if (real.equals(pathResolver.root())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Cannot Delete Vault Root Dir. ");
        }
        try (var stream = Files.walk(real)) {
            stream.sorted(java.util.Comparator.reverseOrder()).forEach(path -> {
                try {
                    if (path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md")) {
                        indexService.removeIndex(pathResolver.toRelative(path));
                    }
                    Files.deleteIfExists(path);
                } catch (IOException ex) {
                    log.warn("[Vault] Delete folder entry failed: {}", path);
                }
            });
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Delete folder failed. ");
        }
        log.info("[Vault] folder deleted: {}", relPath);
    }

    /** Read Vault Any existing file inside(Attachment preview uses; onlyRead).  */
    /**
     * Save Attachment to Attachments/(Obsidian  DefaultAttachmentDirectoryconvention). 
     *
     * before whole project exceptPaper PDF nothing outsideUploadentry -- Whitelist allows write Attachments/ underImage, 
     * But no way to add image, equals useless. 
     *
     * Same-name file not overwritten, Append -1 / -2 suffix: Attachment is [[embed]] Referenced, 
     * overwrite will make otherin notegraph silentlyChangeinto anotherOneZhang. 
     *
     * @return Relative Path, E.g. Attachments/figure-1.png
     */
    public Map<String, Object> saveAttachment(String originalName, byte[] bytes) {
        if (bytes == null || bytes.length == 0) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Attachment content empty. ");
        }
        String raw = originalName == null || originalName.isBlank() ? "attachment" : originalName;
        // only takeFile Namepart, blockCallcaller anyDirectorycomponent. 
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

        // via resolveForWrite go full traversal check + Extension Whitelist. 
        Path real = pathResolver.resolveForWrite(relPath);
        try {
            Files.createDirectories(real.getParent());
            Files.write(real, bytes);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Write attachment failed: " + relPath);
        }
        watchService.refreshStamp(real);
        log.info("[Vault] attachment saved: {} ({} bytes)", relPath, bytes.length);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("name", base + ext);
        result.put("size", bytes.length);
        // embed isCan directly insert Markdown   Obsidian embedSyntax. 
        result.put("embed", "![[" + base + ext + "]]");
        return result;
    }

    public byte[] readRaw(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        try {
            return Files.readAllBytes(real);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Read file failed. ");
        }
    }

    private String sanitizeFileName(String name) {
        String sanitized = INVALID_FILE_CHARS.matcher(name.trim()).replaceAll("_");
        return sanitized.isBlank() ? "Untitled" : sanitized;
    }

    /** Vault Whether same-name note exists in root(legacy uniqueTitle use).  */
    public boolean titleExistsAtRoot(String title) {
        return Files.exists(pathResolver.root().resolve(sanitizeFileName(title) + ".md"));
    }

    /** Property panel write back: Update frontmatter(Other body untouched).  */
    public Map<String, Object> saveProperties(String relPath, Map<String, Object> properties, Long baseMtime) {
        Path real = pathResolver.resolveExisting(relPath);
        long currentMtime = real.toFile().lastModified();
        if (baseMtime != null && baseMtime > 0 && currentMtime > baseMtime) {
            throw new ApiException(HttpStatus.CONFLICT, "File modified externally, Please refresh and retry. ");
        }
        FrontmatterService.ParsedFrontmatter parsed;
        try {
            parsed = frontmatterService.parse(Files.readString(real, StandardCharsets.UTF_8));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Read file failed. ");
        }
        if (!parsed.valid()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "current frontmatter parseFailed, Please manually fix first YAML Edit property again. ");
        }
        writeFileAndIndex(real, frontmatterService.compose(properties, parsed.body()));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("path", relPath);
        result.put("mtime", real.toFile().lastModified());
        result.put("saved", true);
        return result;
    }
}
