package com.kms.llm.client;

import com.kms.common.ApiException;
import com.kms.llm.model.LlmModel;
import com.kms.llm.provider.LlmProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class OllamaClient implements LlmClient {
    @Override
    public LlmResponse call(LlmProvider provider, LlmModel model, LlmRequest request) {
        throw new ApiException(HttpStatus.NOT_IMPLEMENTED, "Ollama chat client is not wired yet; use OpenAI-compatible or mock.");
    }
}
