package com.kms.vault;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Backlink Query API(By path). Linked go note_links Index, 
 * Unlinked asFull TextScanverify; all path via VaultPathResolver check. 
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

    /** Unlinked mention -> wiki link: rewrite sourceFileNo.Oneplain text appears at.  */
    @PostMapping("/create")
    public Map<String, Object> createLink(@RequestBody CreateLinkRequest request) {
        return linkService.createLink(request.sourcePath(), request.targetTitle());
    }
}
