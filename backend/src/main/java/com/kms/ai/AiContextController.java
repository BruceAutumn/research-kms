package com.kms.ai;

import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai/context")
public class AiContextController {

    private final AiContextService service;

    public AiContextController(AiContextService service) {
        this.service = service;
    }

    @PostMapping("/resolve")
    public Map<String, Object> resolve(@RequestBody Map<String, Object> body) {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> refs = (List<Map<String, Object>>) body.get("refs");
        return service.resolve(refs);
    }

    @GetMapping("/suggest")
    public Map<String, Object> suggest(@RequestParam String q,
                                        @RequestParam(required = false, defaultValue = "paper,note,tag") String types) {
        return service.suggest(q, types);
    }
}