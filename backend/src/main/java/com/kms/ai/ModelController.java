package com.kms.ai;

import com.kms.ai.dto.ModelConfigDto;
import com.kms.ai.dto.ModelConfigRequest;
import com.kms.ai.dto.ModelTestResult;
import com.kms.llm.client.LlmClientFactory;
import com.kms.llm.dto.LlmModelDto;
import com.kms.llm.dto.LlmModelRequest;
import com.kms.llm.model.LlmModelService;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Deprecated
@RestController
@RequestMapping("/api/models")
public class ModelController {
    private final LlmModelService modelService;
    private final LlmClientFactory llmClientFactory;

    public ModelController(LlmModelService modelService, LlmClientFactory llmClientFactory) {
        this.modelService = modelService;
        this.llmClientFactory = llmClientFactory;
    }

    @GetMapping
    public List<ModelConfigDto> list() {
        return modelService.list().stream().map(modelService::toLegacyDto).toList();
    }

    @PostMapping
    public ModelConfigDto create(@RequestBody ModelConfigRequest request) {
        return modelService.createLegacy(request);
    }

    @PatchMapping("/{id}")
    public ModelConfigDto update(@PathVariable Long id, @RequestBody ModelConfigRequest request) {
        LlmModelRequest modelRequest = new LlmModelRequest();
        modelRequest.setModelId(request.getModelName());
        modelRequest.setDisplayName(request.getName());
        modelRequest.setContextWindow(request.getContextWindow());
        modelRequest.setIsDefault(request.getIsDefault());
        LlmModelDto updated = modelService.update(id, modelRequest);
        return modelService.toLegacyDto(updated);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        modelService.delete(id);
    }

    @PostMapping("/{id}/default")
    public ModelConfigDto setDefault(@PathVariable Long id) {
        return modelService.toLegacyDto(modelService.setDefault(id));
    }

    @PostMapping("/{id}/test")
    public ModelTestResult test(@PathVariable Long id) {
        return llmClientFactory.legacyTestModel(id);
    }
}
