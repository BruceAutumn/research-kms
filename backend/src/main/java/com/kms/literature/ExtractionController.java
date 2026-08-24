package com.kms.literature;

import com.kms.literature.dto.AiExtractionDto;
import com.kms.literature.dto.EditExtractionRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/extractions")
public class ExtractionController {
    private final ExtractionService extractionService;

    public ExtractionController(ExtractionService extractionService) {
        this.extractionService = extractionService;
    }

    @GetMapping("/paper/{id}")
    public List<AiExtractionDto> list(@PathVariable Long id) {
        return extractionService.list(id);
    }

    @PostMapping("/{id}/accept")
    public AiExtractionDto accept(@PathVariable Long id) {
        return extractionService.accept(id);
    }

    @PostMapping("/{id}/reject")
    public AiExtractionDto reject(@PathVariable Long id) {
        return extractionService.reject(id);
    }

    @PostMapping("/{id}/edit")
    public AiExtractionDto edit(@PathVariable Long id, @RequestBody EditExtractionRequest request) {
        return extractionService.edit(id, request.getUserValue());
    }

    @PostMapping("/paper/{id}/accept-all")
    public List<AiExtractionDto> acceptAll(@PathVariable Long id) {
        return extractionService.acceptAll(id);
    }
}
