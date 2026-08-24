package com.kms.vault;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.multipart.MultipartFile;
import com.kms.common.ApiException;
import org.springframework.http.HttpStatus;
import java.io.IOException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.Map;

/**
 * Vault 管理接口：info / tree / reindex / rescan / watch(SSE) / folders。
 * 所有 path 相关操作一律经 VaultPathResolver（见 VaultService）。
 */
@RestController
@RequestMapping("/api/vault")
public class VaultController {

    private final VaultService vaultService;
    private final VaultIndexService indexService;
    private final VaultWatchService watchService;
    private final VaultPathResolver pathResolver;

    public VaultController(VaultService vaultService, VaultIndexService indexService,
                           VaultWatchService watchService, VaultPathResolver pathResolver) {
        this.vaultService = vaultService;
        this.indexService = indexService;
        this.watchService = watchService;
        this.pathResolver = pathResolver;
    }

    @GetMapping("/info")
    public Map<String, Object> info() {
        return vaultService.info();
    }

    @GetMapping("/tree")
    public Map<String, Object> tree() {
        return vaultService.tree();
    }

    /** 全量重建索引：任何时候清空索引重建都不会丢数据（真相来源是 .md 文件）。 */
    @PostMapping("/reindex")
    public Map<String, Object> reindex() {
        return indexService.reindexAll();
    }

    /** 手动触发一次变更扫描（轮询扫描器的即时版）。 */
    @PostMapping("/rescan")
    public Map<String, Object> rescan() {
        return watchService.rescan();
    }

    /** SSE：外部文件修改通知（轮询扫描器广播，非即时，见 UI 标注）。 */
    @GetMapping(value = "/watch", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter watch() {
        return watchService.registerEmitter();
    }

    public record CreateFolderRequest(String parentPath, String name) {}

    @PostMapping("/folders")
    public Map<String, Object> createFolder(@RequestBody CreateFolderRequest request) {
        return vaultService.createFolder(request.parentPath(), request.name());
    }

    @DeleteMapping("/folders")
    public void deleteFolder(@RequestParam("path") String path) {
        vaultService.deleteFolder(path);
    }

    /** 读取 Vault 内任意文件（附件预览：图片/PDF 等，只读）。 */
    /**
     * 上传附件到 Attachments/。编辑器里粘贴或拖拽图片时调用。
     * 返回 {path, name, size, embed}，其中 embed 是可直接插进 Markdown 的 ![[名字]]。
     */
    @PostMapping("/attachments")
    public Map<String, Object> uploadAttachment(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "未收到文件。");
        }
        try {
            return vaultService.saveAttachment(file.getOriginalFilename(), file.getBytes());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "读取上传内容失败: " + ex.getMessage());
        }
    }

    @GetMapping("/file")
    public ResponseEntity<byte[]> rawFile(@RequestParam("path") String path) {
        Path real = pathResolver.resolveExisting(path);
        byte[] bytes = vaultService.readRaw(path);
        String contentType;
        try {
            contentType = Files.probeContentType(real);
        } catch (Exception ex) {
            contentType = null;
        }
        String lowerName = real.getFileName().toString().toLowerCase(Locale.ROOT);
        boolean activeType = lowerName.endsWith(".svg") || lowerName.endsWith(".html") || lowerName.endsWith(".htm");
        String disposition = (activeType
                ? org.springframework.http.ContentDisposition.attachment()
                : org.springframework.http.ContentDisposition.inline())
                .filename(real.getFileName().toString(), StandardCharsets.UTF_8)
                .build().toString();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header("X-Content-Type-Options", "nosniff")
                .header("Content-Security-Policy", "default-src 'none'; sandbox")
                .body(bytes);
    }
}
