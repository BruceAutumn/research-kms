package com.kms.llm.provider;

import com.kms.llm.dto.LlmProviderDto;
import com.kms.llm.dto.LlmProviderRequest;
import com.kms.llm.dto.LlmProviderTestResult;
import com.kms.llm.dto.RemoteModelDto;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/llm/providers")
public class LlmProviderController {
    private final LlmProviderService service;

    public LlmProviderController(LlmProviderService service) {
        this.service = service;
    }

    @GetMapping
    public List<LlmProviderDto> list() {
        return service.list();
    }

    @PostMapping
    public LlmProviderDto create(@RequestBody LlmProviderRequest request) {
        return service.create(request);
    }

    @PatchMapping("/{id}")
    public LlmProviderDto update(@PathVariable Long id, @RequestBody LlmProviderRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/test")
    public LlmProviderTestResult test(@PathVariable Long id) {
        return service.test(id);
    }

    @GetMapping("/{id}/models/remote")
    public List<RemoteModelDto> remoteModels(@PathVariable Long id) {
        return service.remoteModels(id);
    }
}
