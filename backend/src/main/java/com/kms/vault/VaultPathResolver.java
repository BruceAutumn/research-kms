package com.kms.vault;

import com.kms.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.util.Locale;
import java.util.Set;

/**
 * Vault Path Security Resolver -- this phaseSegmenthighest priorityFirstlevel, all involving path APIMustvia it parse. 
 *
 * rule(Enforce on every file op): 
 *  1. reject null/Blank, Absolute Path(with Windows drive letter), anyForm like `..`  Segment; 
 *  2. concat VAULT_ROOT after normalize; ToExists Path toRealPath()(parse symbolLink), 
 *     On new file check nearest existing ancestor toRealPath(); 
 *  3. resultMuststill at VAULT_ROOT within, otherwise 403; 
 *  4. Write only allows whitelisted extensions: .md / .canvas, and Attachments/ underImage / PDF / Audio/Video. 
 *
 * Backend runs on host, Run as current user, No container boundary fallback -- Onea traversal vulnerability
 * equals whole home Dir read-write, thus this classinProcess, forbid in Controller Write once each in. 
 */
@Component
public class VaultPathResolver {

    private static final Set<String> WRITE_ALLOWED_EXTENSIONS = Set.of(".md", ".canvas");
    /**
     * Attachments/ Writable attachment types under. 
     * Audio/video added this time -- Vault should hold experiment videos, Meeting Recording, Only allow images and PDF not enough. 
     * stillWhitelistcontrol: not inTablein Onealways reject, Never change to blacklist. 
     */
    private static final Set<String> ATTACHMENT_EXTENSIONS = Set.of(
            // Image
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".avif",
            // document
            ".pdf",
            // Audio
            ".mp3", ".wav", ".m4a", ".ogg", ".flac",
            // Video
            ".mp4", ".webm", ".mov", ".m4v");

    private final Path root;

    public VaultPathResolver(Path vaultRootPath) {
        this.root = vaultRootPath;
    }

    public Path root() {
        return root;
    }

    /** Relative Path -> Vault Inner real file path(File must exist).  */
    public Path resolveExisting(String relativePath) {
        return resolve(relativePath, false, false);
    }

    /** Relative Path -> Vault Inner Path, used forWrite/Create(Path may not exist yet).  */
    public Path resolveForWrite(String relativePath) {
        return resolve(relativePath, true, false);
    }

    /** Relative Path -> Vault Inner dir path(used forDirectoryoperation, No Extension Limit).  */
    public Path resolveDir(String relativePath) {
        return resolve(relativePath, false, true);
    }

    private Path resolve(String relativePath, boolean allowMissing, boolean isDir) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "path cannot beEmpty. ");
        }
        String raw = relativePath.trim();
        // Reject absolute path(Unix and Windows drive form)
        if (raw.startsWith("/") || raw.startsWith("\\")
                || (raw.length() >= 2 && Character.isLetter(raw.charAt(0)) && raw.charAt(1) == ':')) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: Absolute path not allowed. ");
        }
        // explicit check URL encoded traversal(%2e%2e%2f): Some clients/Proxy layer does not decode
        // Query Params, thisindoOnecheck--after decode has .. Segment or absolute path always 403. 
        // note: stillOriginalstart string parsePath(Avoid double decode of legal filename). 
        if (raw.contains("%")) {
            try {
                String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
                if (!decoded.equals(raw)) {
                    if (decoded.startsWith("/") || decoded.startsWith("\\")
                            || (decoded.length() >= 2 && Character.isLetter(decoded.charAt(0)) && decoded.charAt(1) == ':')) {
                        throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: Absolute path not allowed. ");
                    }
                    for (Path part : Path.of(decoded)) {
                        if (part.toString().equals("..")) {
                            throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: disallow .. Segment. ");
                        }
                    }
                }
            } catch (IllegalArgumentException ex) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Path encoding invalid. ");
            }
        }
        Path rel = Path.of(raw);
        // reject any `..` Segment(Regardless normalize after whether still inRootin -- iron law 3  )
        for (Path part : rel) {
            if (part.toString().equals("..")) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: disallow .. Segment. ");
            }
        }
        Path candidate = root.resolve(rel).normalize();
        // normalize later fallback check: Never exceed root
        if (!candidate.startsWith(root)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: Path exceeds Vault Root Dir. ");
        }
        // Write extension whitelist(Skip existing read paths)
        if (allowMissing && !isDir) {
            checkWriteExtension(rel);
        }
        if (Files.exists(candidate, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(candidate)) {
            // Exists(Or symlink): parseRealPath, Prevent"pointing external symlink"
            Path real;
            try {
                real = candidate.toRealPath();
            } catch (IOException ex) {
                // danglingEmptysymbolLink: reject
                throw new ApiException(HttpStatus.FORBIDDEN, "Path unresolvable(symbolLinkbroken or rejected). ");
            }
            if (!real.startsWith(root)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: symbolLinkpoint to Vault external. ");
            }
            if (Files.isDirectory(real) && !isDir) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "target isOne Directory, is notFile. ");
            }
            if (!Files.isDirectory(real) && isDir) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "target isOne File, is notDirectory. ");
            }
            return real;
        }
        if (allowMissing) {
            // New: checkRecentExistsancestorFirstDirectory(samePrevent symlink escape)
            Path nearest = candidate.getParent() != null ? candidate.getParent() : root;
            while (nearest != null && !Files.exists(nearest, LinkOption.NOFOLLOW_LINKS)) {
                nearest = nearest.getParent();
            }
            if (nearest != null) {
                Path realParent;
                try {
                    realParent = nearest.toRealPath();
                } catch (IOException ex) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "parentDirectorynotCanparse. ");
                }
                if (!realParent.startsWith(root)) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "Path traversal rejected: parentDirectorysymbolLinkpoint to Vault external. ");
                }
            }
            return candidate;
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "File not found: " + relativePath);
    }

    private void checkWriteExtension(Path rel) {
        String name = rel.getFileName() == null ? "" : rel.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot).toLowerCase(Locale.ROOT) : "";
        if (WRITE_ALLOWED_EXTENSIONS.contains(ext)) {
            return;
        }
        // Attachments/ underImageand PDF Allow Write
        boolean inAttachments = rel.getNameCount() > 1
                && rel.getName(0).toString().equals("Attachments");
        if (inAttachments && ATTACHMENT_EXTENSIONS.contains(ext)) {
            return;
        }
        throw new ApiException(HttpStatus.FORBIDDEN,
                "Write not allowed for this extension(allow .md / .canvas, Attachments/ Allow images under / PDF / Audio / Video): " + name);
    }

    /**   Vault Convert inner absolute to relative(used forIndexstore).  */
    public String toRelative(Path absolute) {
        Path abs = absolute.toAbsolutePath().normalize();
        if (!abs.startsWith(root)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "Path not in Vault. ");
        }
        return root.relativize(abs).toString().replace('\\', '/');
    }
}
