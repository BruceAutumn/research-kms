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
import java.util.Map;

/**
 * Vault Management API: info / tree / reindex / rescan / watch(SSE) / folders. 
 * all path related opsOnealways via VaultPathResolver(see VaultService). 
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

    /** Full Rebuild Index: anytimeClearIndexrebuild keeps allData(Source of truth is .md File).  */
    @PostMapping("/reindex")
    public Map<String, Object> reindex() {
        return indexService.reindexAll();
    }

    /** Manually trigger a change scan(Poll scanner instant version).  */
    @PostMapping("/rescan")
    public Map<String, Object> rescan() {
        return watchService.rescan();
    }

    /** SSE: External file change notification(Poll scanner broadcast, non-I.e.when, see UI Annotation).  */
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

    /** Read Vault Any file inside(Attachment Preview: Image/PDF etc, onlyRead).  */
    /**
     * Upload attachment to Attachments/. Called on paste/drop image in editor. 
     * Back {path, name, size, embed}, Among embed isCan directly insert Markdown   ![[Name]]. 
     */
    @PostMapping("/attachments")
    public Map<String, Object> uploadAttachment(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "not receivedFile. ");
        }
        try {
            return vaultService.saveAttachment(file.getOriginalFilename(), file.getBytes());
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Read upload content failed: " + ex.getMessage());
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
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, contentType == null ? MediaType.APPLICATION_OCTET_STREAM_VALUE : contentType)
                .body(bytes);
    }
}
