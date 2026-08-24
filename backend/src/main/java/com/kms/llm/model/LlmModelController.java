package com.kms.llm.model;

import com.kms.llm.dto.LlmModelDto;
import com.kms.llm.dto.LlmModelRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/llm/models")
public class LlmModelController {
    private final LlmModelService service;

    public LlmModelController(LlmModelService service) {
        this.service = service;
    }

    @GetMapping
    public List<LlmModelDto> list() {
        return service.list();
    }

    @PostMapping
    public LlmModelDto create(@RequestBody LlmModelRequest request) {
        return service.create(request);
    }

    @PatchMapping("/{id}")
    public LlmModelDto update(@PathVariable Long id, @RequestBody LlmModelRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/default")
    public LlmModelDto setDefault(@PathVariable Long id) {
        return service.setDefault(id);
    }
}
