package com.kms.llm.client;

import com.kms.llm.model.LlmModel;
import com.kms.llm.provider.LlmProvider;

import java.util.function.Consumer;

public interface LlmClient {
    LlmResponse call(LlmProvider provider, LlmModel model, LlmRequest request);

    default void stream(LlmProvider provider, LlmModel model, LlmRequest request, Consumer<StreamChunk> onChunk) {
        LlmResponse response = call(provider, model, request);
        onChunk.accept(new StreamChunk(response.content(), response.tokenUsage()));
    }
}
