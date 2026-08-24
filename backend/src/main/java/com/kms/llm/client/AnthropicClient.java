package com.kms.llm.client;

import com.kms.common.ApiException;
import com.kms.llm.model.LlmModel;
import com.kms.llm.provider.LlmProvider;
import com.kms.llm.provider.LlmProviderService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class AnthropicClient implements LlmClient {
    private final LlmProviderService providerService;

    public AnthropicClient(LlmProviderService providerService) {
        this.providerService = providerService;
    }

    @Override
    public LlmResponse call(LlmProvider provider, LlmModel model, LlmRequest request) {
        String apiKey = providerService.decryptApiKey(provider);
        if (apiKey == null || apiKey.isBlank()) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "Anthropic provider is missing API key.");
        }
        throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "Anthropic chat client is not wired yet; use OpenAI-compatible or mock.");
    }
}
