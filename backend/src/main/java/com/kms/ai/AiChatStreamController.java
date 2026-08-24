package com.kms.ai;

import com.kms.ai.dto.ChatStreamRequest;
import com.kms.common.ApiException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/ai/chat")
public class AiChatStreamController {
    private final AiChatStreamService service;

    public AiChatStreamController(AiChatStreamService service) {
        this.service = service;
    }

    @PostMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public ResponseEntity<SseEmitter> stream(@RequestBody ChatStreamRequest request) {
        return ResponseEntity.ok()
                .contentType(MediaType.TEXT_EVENT_STREAM)
                .cacheControl(CacheControl.noCache())
                .header("X-Accel-Buffering", "no")
                .body(service.stream(request));
    }

    @PostMapping(value = "/attachment", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String, Object> uploadAttachment(@RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "not receivedFile. ");
        }
        try {
            Path tempDir = Files.createTempDirectory("ai-chat-attach");
            String originalName = file.getOriginalFilename() != null ? file.getOriginalFilename() : "upload";
            Path saved = tempDir.resolve(System.currentTimeMillis() + "_" + originalName);
            file.transferTo(saved.toFile());
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("path", saved.toString());
            result.put("name", originalName);
            result.put("size", file.getSize());
            result.put("contentType", file.getContentType());
            return result;
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "File upload failed: " + ex.getMessage());
        }
    }
}
