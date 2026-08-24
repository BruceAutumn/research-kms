package com.kms.llm.client;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.common.ApiException;
import com.kms.llm.model.LlmModel;
import com.kms.llm.provider.LlmProvider;
import com.kms.llm.provider.LlmProviderService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component("llmOpenAiCompatibleClient")
public class OpenAiCompatibleClient implements LlmClient {
    private final RestClient.Builder restClientBuilder;
    private final ObjectMapper objectMapper;
    private final LlmProviderService providerService;
    private final int defaultMaxTokens;
    private final int embeddingDim;
    private final int embeddingMaxChars;

    public OpenAiCompatibleClient(RestClient.Builder restClientBuilder, ObjectMapper objectMapper,
                                  LlmProviderService providerService,
                                  @Value("${app.llm.default-max-tokens:8192}") int defaultMaxTokens,
                                  @Value("${app.embedding.dim:1024}") int embeddingDim,
                                  @Value("${app.embedding.max-chars:8000}") int embeddingMaxChars) {
        this.restClientBuilder = restClientBuilder;
        this.objectMapper = objectMapper;
        this.providerService = providerService;
        this.defaultMaxTokens = defaultMaxTokens;
        this.embeddingDim = embeddingDim;
        this.embeddingMaxChars = embeddingMaxChars;
    }

    @Override
    public LlmResponse call(LlmProvider provider, LlmModel model, LlmRequest request) {
        String apiKey = providerService.decryptApiKey(provider);
        if (isBlank(provider.getBaseUrl()) || isBlank(model.getModelId()) || isBlank(apiKey)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM not configured: Base URL / Model / API Key missing.");
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model.getModelId());
        body.put("temperature", 0.2);
        // 默认输出上限原为 4096，长文总结经常被截断在半句话上。
        body.put("max_tokens", request.maxTokens() == null ? defaultMaxTokens : Math.max(1, request.maxTokens()));
        body.put("messages", (request.messages() == null ? List.<ChatMessageDto>of() : request.messages()).stream()
                .map(message -> Map.of("role", message.role() == null ? "user" : message.role(),
                        "content", message.content() == null ? "" : message.content()))
                .toList());
        try {
            JsonNode response = restClientBuilder.build()
                    .post()
                    .uri(stripTrailingSlash(provider.getBaseUrl()) + "/chat/completions")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);
            JsonNode usage = response == null ? null : response.get("usage");
            JsonNode content = response == null ? null : response.at("/choices/0/message/content");
            if (content == null || content.isMissingNode()) {
                throw new ApiException(HttpStatus.BAD_GATEWAY, "LLM response did not contain choices[0].message.content.");
            }
            return new LlmResponse(content.asText(), usage != null && usage.isObject()
                    ? objectMapper.convertValue(usage, new TypeReference<Map<String, Object>>() {})
                    : Map.of());
        } catch (RestClientResponseException ex) {
            throw classifyHttpFailure(ex);
        } catch (ResourceAccessException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "LLM network timeout or connection failure.");
        } catch (RestClientException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "LLM request failed: " + sanitize(ex.getMessage()));
        }
    }

    private ApiException classifyHttpFailure(RestClientResponseException ex) {
        int code = ex.getStatusCode().value();
        if (code == 401 || code == 403) return new ApiException(HttpStatus.BAD_GATEWAY, code + " authentication failed.");
        if (code == 404) return new ApiException(HttpStatus.BAD_GATEWAY, "404 model or path not found.");
        if (code == 408 || code == 504) return new ApiException(HttpStatus.GATEWAY_TIMEOUT, code + " request timeout.");
        return new ApiException(HttpStatus.BAD_GATEWAY, code + " upstream rejected request: " + truncate(sanitize(ex.getResponseBodyAsString()), 240));
    }

    /**
     * 生成 embedding 向量。
     *
     * 与旧实现的区别：
     *   - 支持 provider.kind = 'ollama'，走原生 /api/embeddings（无需 API Key）；
     *     Ollama 新旧版本端点不同，故 404 时自动回落到 /api/embed。
     *   - 不再硬编码 "text-embedding-3-small" 兜底 —— 直接用配置里的 model_id，
     *     兜底会让「配错模型」表现为「返回了别的模型的向量」，比报错更难查。
     *   - 单次请求长度上限保护。
     *   - 返回维度与 app.embedding.dim 不一致时快速失败，不静默截断也不补零：
     *     混入不同维度/不同模型的向量会让余弦距离彻底失去意义。
     */
    public float[] embed(LlmProvider provider, LlmModel model, String text) {
        String input = text == null ? "" : text;
        if (input.length() > embeddingMaxChars) {
            throw new ApiException(HttpStatus.BAD_REQUEST,
                    "Embedding 输入过长: " + input.length() + " 字符，上限 " + embeddingMaxChars
                            + "。应先经 ChunkingService 切块再逐块 embed。");
        }
        if (isBlank(provider.getBaseUrl())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM not configured for embedding: Base URL missing.");
        }
        if (isBlank(model.getModelId())) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM not configured for embedding: Model id missing.");
        }

        float[] result = "ollama".equalsIgnoreCase(provider.getKind())
                ? embedViaOllama(provider, model, input)
                : embedViaOpenAi(provider, model, input);

        if (result.length != embeddingDim) {
            throw new ApiException(HttpStatus.BAD_GATEWAY,
                    "Embedding 维度不匹配: 模型 " + model.getModelId() + " 返回 " + result.length
                            + " 维，配置 app.embedding.dim=" + embeddingDim
                            + "。换模型必须同步改迁移里的 vector(N)，不要只改配置。");
        }
        return result;
    }

    /** Ollama 原生端点，不带 Authorization。 */
    private float[] embedViaOllama(LlmProvider provider, LlmModel model, String input) {
        String base = stripTrailingSlash(provider.getBaseUrl());
        try {
            JsonNode response = restClientBuilder.build()
                    .post()
                    .uri(base + "/api/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("model", model.getModelId(), "prompt", input))
                    .retrieve()
                    .body(JsonNode.class);
            float[] parsed = readVector(response, "/embedding");
            if (parsed != null) return parsed;
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Ollama /api/embeddings 响应里没有 embedding 字段。");
        } catch (RestClientResponseException ex) {
            if (ex.getStatusCode().value() != 404) throw classifyHttpFailure(ex);
            // 新版 Ollama 把原生端点换成了 /api/embed，响应形状也从 embedding 变成 embeddings[0]。
            return embedViaOllamaNewEndpoint(base, model, input);
        } catch (ResourceAccessException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "Ollama 连接失败，确认 `ollama serve` 是否在跑: " + sanitize(ex.getMessage()));
        } catch (RestClientException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Ollama embedding 请求失败: " + sanitize(ex.getMessage()));
        }
    }

    private float[] embedViaOllamaNewEndpoint(String base, LlmModel model, String input) {
        try {
            JsonNode response = restClientBuilder.build()
                    .post()
                    .uri(base + "/api/embed")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("model", model.getModelId(), "input", input))
                    .retrieve()
                    .body(JsonNode.class);
            float[] parsed = readVector(response, "/embeddings/0");
            if (parsed != null) return parsed;
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Ollama /api/embed 响应里没有 embeddings[0]。");
        } catch (RestClientResponseException ex) {
            throw classifyHttpFailure(ex);
        } catch (ResourceAccessException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "Ollama 连接失败: " + sanitize(ex.getMessage()));
        } catch (RestClientException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Ollama embedding 请求失败: " + sanitize(ex.getMessage()));
        }
    }

    /** OpenAI 兼容层 /embeddings。 */
    private float[] embedViaOpenAi(LlmProvider provider, LlmModel model, String input) {
        String apiKey = providerService.decryptApiKey(provider);
        if (isBlank(apiKey)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "LLM not configured for embedding: API Key missing.");
        }
        try {
            JsonNode response = restClientBuilder.build()
                    .post()
                    .uri(stripTrailingSlash(provider.getBaseUrl()) + "/embeddings")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header(HttpHeaders.AUTHORIZATION, "Bearer " + apiKey)
                    .body(Map.of("model", model.getModelId(), "input", input))
                    .retrieve()
                    .body(JsonNode.class);
            float[] parsed = readVector(response, "/data/0/embedding");
            if (parsed != null) return parsed;
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Embedding response did not contain data[0].embedding.");
        } catch (RestClientResponseException ex) {
            throw classifyHttpFailure(ex);
        } catch (ResourceAccessException ex) {
            throw new ApiException(HttpStatus.GATEWAY_TIMEOUT, "Embedding network timeout.");
        } catch (RestClientException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Embedding request failed: " + sanitize(ex.getMessage()));
        }
    }

    private float[] readVector(JsonNode response, String pointer) {
        if (response == null) return null;
        JsonNode node = response.at(pointer);
        if (node == null || !node.isArray() || node.isEmpty()) return null;
        float[] result = new float[node.size()];
        for (int i = 0; i < node.size(); i++) {
            result[i] = (float) node.get(i).asDouble();
        }
        return result;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank() || "unknown".equals(value);
    }

    private String stripTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() <= maxChars ? text : text.substring(0, maxChars);
    }

    private String sanitize(String value) {
        if (value == null) return "";
        return value.replaceAll("sk-[A-Za-z0-9_\\-]{8,}", "sk-[REDACTED]")
                .replaceAll("(?i)bearer\\s+[A-Za-z0-9._\\-]{12,}", "Bearer [REDACTED]");
    }
}
