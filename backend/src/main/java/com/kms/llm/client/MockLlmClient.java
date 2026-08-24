package com.kms.llm.client;

import com.kms.llm.model.LlmModel;
import com.kms.llm.provider.LlmProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Component
public class MockLlmClient implements LlmClient {
    @Override
    public LlmResponse call(LlmProvider provider, LlmModel model, LlmRequest request) {
        String lastUser = request.messages() == null ? "" : request.messages().stream()
                .filter(message -> "user".equals(message.role()))
                .reduce((a, b) -> b)
                .map(message -> message.content() == null ? "" : message.content())
                .orElse("");
        String content = lastUser.contains("Count to ten")
                ? "One, Two, Three, Four, Five, Six, Seven, Eight, Nine, Ten. "
                : "(MOCK_LLM)I got your question. ";
        return new LlmResponse(content, Map.of("mock", true));
    }

    @Override
    public void stream(LlmProvider provider, LlmModel model, LlmRequest request, Consumer<StreamChunk> onChunk) {
        for (String token : splitTokens(call(provider, model, request).content())) {
            onChunk.accept(new StreamChunk(token, Map.of("mock", true)));
            try {
                Thread.sleep(25);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return;
            }
        }
    }

    private List<String> splitTokens(String value) {
        return value == null || value.isBlank() ? List.of("") : value.codePoints()
                .mapToObj(cp -> new String(Character.toChars(cp)))
                .toList();
    }
}
