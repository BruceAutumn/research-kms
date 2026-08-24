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
 * Vault 路径安全解析器 —— 本阶段最高优先级，所有涉及 path 的接口必须经它解析。
 *
 * 规则（对每次文件操作强制执行）：
 *  1. 拒绝 null/空白、绝对路径（含 Windows 盘符）、任何形如 `..` 的段；
 *  2. 拼接 VAULT_ROOT 后 normalize；对已存在的路径 toRealPath()（解析符号链接），
 *     新建文件时对最近已存在的祖先目录 toRealPath()；
 *  3. 结果必须仍位于 VAULT_ROOT 之内，否则 403；
 *  4. 写入仅允许白名单扩展名：.md / .canvas，以及 Attachments/ 下的图片 / PDF / 音视频。
 *
 * 后端跑在宿主机、以当前用户身份运行，没有容器边界兜底 —— 一个穿越漏洞
 * 等于整个 home 目录可读写，因此本类集中处理、禁止在 Controller 里各写一遍。
 */
@Component
public class VaultPathResolver {

    private static final Set<String> WRITE_ALLOWED_EXTENSIONS = Set.of(".md", ".canvas");
    /**
     * Attachments/ 下允许写入的附件类型。
     * 音视频是这次新加的 —— 知识库要能放实验录像、会议录音，只允许图片和 PDF 不够用。
     * 仍然是白名单制：不在表里的一律拒绝，绝不改成黑名单。
     */
    private static final Set<String> ATTACHMENT_EXTENSIONS = Set.of(
            // 图片
            // SVG is intentionally excluded: active SVG content can execute in
            // a same-origin browser context unless a sanitizer is introduced.
            ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif",
            // 文档
            ".pdf",
            // 音频
            ".mp3", ".wav", ".m4a", ".ogg", ".flac",
            // 视频
            ".mp4", ".webm", ".mov", ".m4v");

    private final Path root;

    public VaultPathResolver(Path vaultRootPath) {
        this.root = vaultRootPath;
    }

    public Path root() {
        return root;
    }

    /** 相对路径 → Vault 内真实文件路径（文件必须已存在）。 */
    public Path resolveExisting(String relativePath) {
        return resolve(relativePath, false, false);
    }

    /** 相对路径 → Vault 内路径，用于写入/创建（路径可以尚不存在）。 */
    public Path resolveForWrite(String relativePath) {
        return resolve(relativePath, true, false);
    }

    /** 相对路径 → Vault 内目录路径（用于目录操作，无扩展名限制）。 */
    public Path resolveDir(String relativePath) {
        return resolve(relativePath, false, true);
    }

    private Path resolve(String relativePath, boolean allowMissing, boolean isDir) {
        if (relativePath == null || relativePath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "path 不能为空。");
        }
        String raw = relativePath.trim();
        // 拒绝绝对路径（Unix 与 Windows 盘符形态）
        if (raw.startsWith("/") || raw.startsWith("\\")
                || (raw.length() >= 2 && Character.isLetter(raw.charAt(0)) && raw.charAt(1) == ':')) {
            throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：绝对路径不允许。");
        }
        // 显式检测 URL 编码的穿越形式（%2e%2e%2f）：某些客户端/代理层不解码
        // 查询参数，这里做一次检测——解码后含 .. 段或为绝对路径一律 403。
        // 注意：仍以原始字符串解析路径（避免对合法文件名二次解码破坏语义）。
        if (raw.contains("%")) {
            try {
                String decoded = URLDecoder.decode(raw, StandardCharsets.UTF_8);
                if (!decoded.equals(raw)) {
                    if (decoded.startsWith("/") || decoded.startsWith("\\")
                            || (decoded.length() >= 2 && Character.isLetter(decoded.charAt(0)) && decoded.charAt(1) == ':')) {
                        throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：绝对路径不允许。");
                    }
                    for (Path part : Path.of(decoded)) {
                        if (part.toString().equals("..")) {
                            throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：不允许 .. 段。");
                        }
                    }
                }
            } catch (IllegalArgumentException ex) {
                throw new ApiException(HttpStatus.FORBIDDEN, "路径编码不合法。");
            }
        }
        Path rel = Path.of(raw);
        // 拒绝任意 `..` 段（无论 normalize 后是否仍在根内 —— 铁律第 3 条）
        for (Path part : rel) {
            if (part.toString().equals("..")) {
                throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：不允许 .. 段。");
            }
        }
        Path candidate = root.resolve(rel).normalize();
        // normalize 后的兜底校验：绝不越出 root
        if (!candidate.startsWith(root)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：路径越出 Vault 根目录。");
        }
        // 写入扩展名白名单（目录与已存在的读取路径跳过）
        if (allowMissing && !isDir) {
            checkWriteExtension(rel);
        }
        if (Files.exists(candidate, LinkOption.NOFOLLOW_LINKS) || Files.isSymbolicLink(candidate)) {
            // 已存在（或符号链接）：解析真实路径，防「指向外部的 symlink」
            Path real;
            try {
                real = candidate.toRealPath();
            } catch (IOException ex) {
                // 悬空符号链接：拒绝
                throw new ApiException(HttpStatus.FORBIDDEN, "路径不可解析（符号链接损坏或被拒绝）。");
            }
            if (!real.startsWith(root)) {
                throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：符号链接指向 Vault 外部。");
            }
            if (Files.isDirectory(real) && !isDir) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "目标是一个目录，不是文件。");
            }
            if (!Files.isDirectory(real) && isDir) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "目标是一个文件，不是目录。");
            }
            return real;
        }
        if (allowMissing) {
            // 新建：校验最近已存在的祖先目录（同样防 symlink 逃逸）
            Path nearest = candidate.getParent() != null ? candidate.getParent() : root;
            while (nearest != null && !Files.exists(nearest, LinkOption.NOFOLLOW_LINKS)) {
                nearest = nearest.getParent();
            }
            if (nearest != null) {
                Path realParent;
                try {
                    realParent = nearest.toRealPath();
                } catch (IOException ex) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "父目录不可解析。");
                }
                if (!realParent.startsWith(root)) {
                    throw new ApiException(HttpStatus.FORBIDDEN, "路径穿越被拒绝：父目录符号链接指向 Vault 外部。");
                }
            }
            return candidate;
        }
        throw new ApiException(HttpStatus.NOT_FOUND, "文件不存在: " + relativePath);
    }

    private void checkWriteExtension(Path rel) {
        String name = rel.getFileName() == null ? "" : rel.getFileName().toString();
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot).toLowerCase(Locale.ROOT) : "";
        if (WRITE_ALLOWED_EXTENSIONS.contains(ext)) {
            return;
        }
        // Attachments/ 下的图片与 PDF 允许写入
        boolean inAttachments = rel.getNameCount() > 1
                && rel.getName(0).toString().equals("Attachments");
        if (inAttachments && ATTACHMENT_EXTENSIONS.contains(ext)) {
            return;
        }
        throw new ApiException(HttpStatus.FORBIDDEN,
                "不允许写入该扩展名（允许 .md / .canvas，Attachments/ 下允许图片 / PDF / 音频 / 视频）: " + name);
    }

    /** 把 Vault 内绝对路径转回相对路径（用于索引存储）。 */
    public String toRelative(Path absolute) {
        Path abs = absolute.toAbsolutePath().normalize();
        if (!abs.startsWith(root)) {
            throw new ApiException(HttpStatus.FORBIDDEN, "路径不属于 Vault。");
        }
        return root.relativize(abs).toString().replace('\\', '/');
    }
}
