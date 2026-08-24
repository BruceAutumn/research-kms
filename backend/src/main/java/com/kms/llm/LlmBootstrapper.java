package com.kms.llm;

import com.kms.llm.dto.LlmModelRequest;
import com.kms.llm.dto.LlmProviderRequest;
import com.kms.llm.model.LlmModelRepository;
import com.kms.llm.model.LlmModelService;
import com.kms.llm.provider.LlmProviderRepository;
import com.kms.llm.provider.LlmProviderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class LlmBootstrapper implements ApplicationRunner {
    private final boolean mockLlm;
    private final LlmProviderRepository providerRepository;
    private final LlmProviderService providerService;
    private final LlmModelRepository modelRepository;
    private final LlmModelService modelService;

    public LlmBootstrapper(@Value("${app.llm.mock:false}") boolean mockLlm,
                           LlmProviderRepository providerRepository, LlmProviderService providerService,
                           LlmModelRepository modelRepository, LlmModelService modelService) {
        this.mockLlm = mockLlm;
        this.providerRepository = providerRepository;
        this.providerService = providerService;
        this.modelRepository = modelRepository;
        this.modelService = modelService;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        if (!mockLlm) return;
        Long providerId = providerRepository.findByNameIgnoreCase("Mock")
                .map(provider -> provider.getId())
                .orElseGet(() -> {
                    LlmProviderRequest request = new LlmProviderRequest();
                    request.setName("Mock");
                    request.setKind("mock");
                    request.setBaseUrl("mock://local");
                    return providerService.create(request).id();
                });
        if (modelRepository.findByProviderIdOrderByDisplayNameAsc(providerId).isEmpty()) {
            LlmModelRequest request = new LlmModelRequest();
            request.setProviderId(providerId);
            request.setModelId("mock-llm");
            request.setDisplayName("Mock LLM");
            request.setContextWindow(128000);
            request.setSupportsTools(true);
            request.setSupportsStream(true);
            request.setIsDefault(modelRepository.findFirstByDefaultModelTrueAndEnabledTrue().isEmpty());
            modelService.create(request);
        }
    }
}
