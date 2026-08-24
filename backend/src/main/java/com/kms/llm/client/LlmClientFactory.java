package com.kms.llm.client;

import com.kms.ai.dto.ChatMessageDto;
import com.kms.ai.dto.ModelTestResult;
import com.kms.llm.model.LlmModel;
import com.kms.llm.model.LlmModelService;
import com.kms.llm.provider.LlmProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.function.Consumer;

@Component
public class LlmClientFactory {
    private final LlmModelService modelService;
    private final OpenAiCompatibleClient openAiCompatibleClient;
    private final AnthropicClient anthropicClient;
    private final OllamaClient ollamaClient;
    private final MockLlmClient mockLlmClient;
    private final boolean mockLlm;

    public LlmClientFactory(LlmModelService modelService, OpenAiCompatibleClient openAiCompatibleClient,
                            AnthropicClient anthropicClient, OllamaClient ollamaClient, MockLlmClient mockLlmClient,
                            @Value("${app.llm.mock:false}") boolean mockLlm) {
        this.modelService = modelService;
        this.openAiCompatibleClient = openAiCompatibleClient;
        this.anthropicClient = anthropicClient;
        this.ollamaClient = ollamaClient;
        this.mockLlmClient = mockLlmClient;
        this.mockLlm = mockLlm;
    }

    public LlmResponse call(LlmRequest request) {
        LlmModel model = modelService.resolve(request.modelId());
        LlmProvider provider = model.getProvider();
        return select(provider).call(provider, model, request);
    }

    public void stream(LlmRequest request, Consumer<StreamChunk> onChunk) {
        LlmModel model = modelService.resolve(request.modelId());
        LlmProvider provider = model.getProvider();
        select(provider).stream(provider, model, request, onChunk);
    }

    public LlmResponse callLegacy(Long legacyModelConfigId, List<ChatMessageDto> messages, Integer maxTokens) {
        Long id = modelService.resolveCompatibleId(legacyModelConfigId);
        return call(new LlmRequest(id, messages, maxTokens));
    }

    public void streamLegacy(Long legacyModelConfigId, List<ChatMessageDto> messages, Integer maxTokens, Consumer<StreamChunk> onChunk) {
        Long id = modelService.resolveCompatibleId(legacyModelConfigId);
        stream(new LlmRequest(id, messages, maxTokens), onChunk);
    }

    public String currentModelId() {
        if (mockLlm) return "mock";
        return modelService.resolve(null).getModelId();
    }

    public Map<String, Object> testModel(Long id) {
        try {
            LlmResponse response = call(new LlmRequest(id, List.of(
                    new ChatMessageDto("system", "Reply OK."),
                    new ChatMessageDto("user", "ping")
            ), 64));
            return Map.of("ok", true, "message", response.content());
        } catch (Exception ex) {
            return Map.of("ok", false, "error", ex.getMessage() == null ? "failed" : ex.getMessage());
        }
    }

    /** 解析当前启用的 embedding 模型（capability='embedding'），供调用方读取 model_id / 维度。 */
    public LlmModel embeddingModel(Long modelId) {
        return modelService.resolveEmbedding(modelId);
    }

    /** 用已解析好的 embedding 模型直接生成向量，避免整批逐条重复解析。 */
    public float[] embedWith(LlmModel model, String text) {
        return openAiCompatibleClient.embed(model.getProvider(), model, text);
    }

    public float[] embed(Long modelId, String text) {
        LlmModel model = modelService.resolveEmbedding(modelId);
        return openAiCompatibleClient.embed(model.getProvider(), model, text);
    }

    public float[] embed(String text) {
        return embed(null, text);
    }

    public ModelTestResult legacyTestModel(Long id) {
        Map<String, Object> result = testModel(id);
        if (Boolean.TRUE.equals(result.get("ok"))) {
            return ModelTestResult.ok(id, String.valueOf(id), "连接成功，模型返回：" + result.get("message"));
        }
        return ModelTestResult.fail(id, String.valueOf(id), "request_failed", String.valueOf(result.get("error")));
    }

    private LlmClient select(LlmProvider provider) {
        if (mockLlm || "mock".equals(provider.getKind())) return mockLlmClient;
        return switch (provider.getKind()) {
            case "anthropic" -> anthropicClient;
            case "ollama" -> ollamaClient;
            default -> openAiCompatibleClient;
        };
    }
}
