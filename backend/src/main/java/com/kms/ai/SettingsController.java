package com.kms.ai;

import com.kms.ai.dto.SettingsDto;
import com.kms.ai.dto.ModelConfigRequest;
import com.kms.llm.model.LlmModel;
import com.kms.llm.model.LlmModelService;
import com.kms.llm.provider.LlmProvider;
import com.kms.llm.provider.LlmProviderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@Deprecated
@RestController
@RequestMapping("/api/settings/llm")
public class SettingsController {
    private final LlmModelService modelService;
    private final LlmProviderService providerService;
    private final boolean mockLlm;

    public SettingsController(LlmModelService modelService, LlmProviderService providerService,
                              @Value("${app.llm.mock:false}") boolean mockLlm) {
        this.modelService = modelService;
        this.providerService = providerService;
        this.mockLlm = mockLlm;
    }

    @GetMapping
    public SettingsDto get() {
        LlmModel model = modelService.resolve(null);
        LlmProvider provider = providerService.get(model.getProviderId());
        return new SettingsDto(provider.getName(), provider.getBaseUrl(), model.getModelId(),
                providerService.toDto(provider).keyMasked());
    }

    /** 前端用:判断当前是模拟模式还是真实调用模式。 */
    @GetMapping("/status")
    public Map<String, Boolean> status() {
        return Map.of("mock", mockLlm);
    }

    @PutMapping
    public SettingsDto update(@RequestBody SettingsDto request) {
        ModelConfigRequest legacy = new ModelConfigRequest();
        legacy.setProvider(request.provider());
        legacy.setBaseUrl(request.baseUrl());
        legacy.setModelName(request.model());
        legacy.setName(request.provider() == null ? request.model() : request.provider() + " " + request.model());
        legacy.setApiKey(request.apiKey());
        legacy.setIsDefault(true);
        modelService.createLegacy(legacy);
        return get();
    }
}
