package com.kms.vault;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 双链查询接口（按 path）。Linked 走 note_links 索引，
 * Unlinked 为全文扫描验证；所有 path 经 VaultPathResolver 校验。
 */
@RestController
@RequestMapping("/api/links")
public class LinkController {

    private final LinkService linkService;

    public LinkController(LinkService linkService) {
        this.linkService = linkService;
    }

    @GetMapping("/backlinks")
    public List<Map<String, Object>> backlinks(@RequestParam("path") String path) {
        return linkService.backlinks(path);
    }

    @GetMapping("/outgoing")
    public List<Map<String, Object>> outgoing(@RequestParam("path") String path) {
        return linkService.outgoing(path);
    }

    @GetMapping("/unlinked")
    public List<Map<String, Object>> unlinked(@RequestParam("path") String path) {
        return linkService.unlinked(path);
    }

    public record CreateLinkRequest(String sourcePath, String targetTitle) {}

    /** Unlinked mention → wiki link：改写源文件第一处纯文本出现。 */
    @PostMapping("/create")
    public Map<String, Object> createLink(@RequestBody CreateLinkRequest request) {
        return linkService.createLink(request.sourcePath(), request.targetTitle());
    }
}
