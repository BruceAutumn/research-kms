package com.kms.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.ai.dto.ExtractedField;
import com.kms.ai.dto.ModelTestResult;
import com.kms.common.ApiException;
import com.kms.llm.client.LlmClientFactory;
import com.kms.llm.client.LlmResponse;
import com.kms.paper.dto.MetadataDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.client.RestClient;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class OpenAiCompatibleClient {
    private final RestClient.Builder restClientBuilder;
    private final SettingsService settingsService;
    private final LlmClientFactory llmClientFactory;
    private final ObjectMapper objectMapper;
    private final boolean mockLlm;
    private final int skeletonCharsOnly;
    private final int skeletonCharsWithRetrieval;
    private final int retrievedCharsMax;
    private final ThreadLocal<Map<String, Object>> lastTokenUsage = ThreadLocal.withInitial(Map::of);

    public OpenAiCompatibleClient(
            RestClient.Builder restClientBuilder,
            SettingsService settingsService,
            LlmClientFactory llmClientFactory,
            ObjectMapper objectMapper,
            @Value("${app.llm.mock:false}") boolean mockLlm,
            @Value("${app.chat.skeleton-chars:24000}") int skeletonCharsOnly,
            @Value("${app.chat.skeleton-chars-with-retrieval:10000}") int skeletonCharsWithRetrieval,
            @Value("${app.chat.retrieved-chars-max:12000}") int retrievedCharsMax
    ) {
        this.restClientBuilder = restClientBuilder;
        this.settingsService = settingsService;
        this.llmClientFactory = llmClientFactory;
        this.objectMapper = objectMapper;
        this.mockLlm = mockLlm;
        this.skeletonCharsOnly = skeletonCharsOnly;
        this.skeletonCharsWithRetrieval = skeletonCharsWithRetrieval;
        this.retrievedCharsMax = retrievedCharsMax;
    }

    public List<MetadataDto> extractMetadata(String pdfText) {
        return extractMetadata(null, pdfText);
    }

    public List<MetadataDto> extractMetadata(Long modelConfigId, String pdfText) {
        if (mockLlm) {
            return List.of(
                    new MetadataDto("Material", "Mock material from paper"),
                    new MetadataDto("Method", "Mock experimental / computational method"),
                    new MetadataDto("Contribution", "Mock key contribution extracted from full text"),
                    new MetadataDto("Keywords", "knowledge management; AI reading; PDF")
            );
        }
        List<ChatMessageDto> messages = List.of(
                new ChatMessageDto("system", ExtractPrompt.SYSTEM),
                new ChatMessageDto("user", truncate(pdfText, 20000))
        );
        String raw = callChatCompletions(modelConfigId, messages);
        String json = stripJsonFence(raw);
        try {
            return objectMapper.readValue(json, new TypeReference<List<MetadataDto>>() {});
        } catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "LLM returned invalid JSON: " + truncate(raw, 1000));
        }
    }

    /**
     * Phase 3/5 结构化提取：要求模型输出带 confidence 与 group 的 JSON 数组。
     * 长文用 SectionExcerpt 分段（保留 Abstract/Introduction/Methods/Conclusion 章节），
     * 而不是粗暴截断前 N 字符。
     */
    public List<ExtractedField> extractFields(String pdfText) {
        return extractFields(null, pdfText);
    }

    public List<ExtractedField> extractFields(Long modelConfigId, String pdfText) {
        if (mockLlm) {
            return List.of(
                    new ExtractedField("Title", "Cesium adsorption on Prussian blue analogues (模拟)", 0.97, "metadata"),
                    new ExtractedField("Authors", "Wang et al. (模拟)", 0.95, "metadata"),
                    new ExtractedField("Year", "2025", 0.99, "metadata"),
                    new ExtractedField("Journal", "Chemical Engineering Journal (模拟)", 0.93, "metadata"),
                    new ExtractedField("DOI", "10.1016/j.cej.2025.000000 (模拟)", 0.90, "metadata"),
                    new ExtractedField("Keywords", "cesium; adsorption; PBA; seawater", 0.92, "keywords"),
                    new ExtractedField("Abstract", "Mock abstract for extraction preview.", 0.88, "abstract"),
                    new ExtractedField("Material", "CuHCF", 0.89, "materials"),
                    new ExtractedField("Temperature", "298 K", 0.94, "conditions"),
                    new ExtractedField("pH", "7.4", 0.85, "conditions"),
                    new ExtractedField("Method", "Batch adsorption experiments; CV testing", 0.91, "methods"),
                    new ExtractedField("Capacity", "512 mg/g", 0.87, "results"),
                    new ExtractedField("Conclusion", "PBA 对 Cs+ 具有高选择性", 0.86, "conclusions")
            );
        }
        String excerpt = SectionExcerpt.excerpt(pdfText, 26000);
        List<ChatMessageDto> messages = List.of(
                new ChatMessageDto("system", ExtractPrompt.SYSTEM_V2),
                new ChatMessageDto("user", excerpt)
        );
        String raw = callChatCompletions(modelConfigId, messages);
        String json = stripJsonFence(raw);
        try {
            return parseExtractedFields(json);
        } catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "LLM returned invalid JSON: " + truncate(raw, 1000));
        }
    }

    private List<ExtractedField> parseExtractedFields(String json) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(json);
        if (root == null || !root.isArray()) {
            throw new JsonProcessingException("not an array") {};
        }
        List<ExtractedField> fields = new ArrayList<>();
        for (JsonNode node : root) {
            if (node == null || !node.isObject()) continue;
            String key = textOrNull(node.get("key"));
            String value = textOrNull(node.get("value"));
            if (key == null || key.isBlank()) continue;
            Double confidence = parseConfidence(node.get("confidence"));
            String group = textOrNull(node.get("group"));
            fields.add(new ExtractedField(key.trim(), value, confidence,
                    group == null || group.isBlank() ? "custom" : group.trim()));
        }
        if (fields.isEmpty()) {
            throw new JsonProcessingException("empty array") {};
        }
        return fields;
    }

    private String textOrNull(JsonNode node) {
        return node == null || node.isNull() ? null : node.asText();
    }

    private Double parseConfidence(JsonNode node) {
        if (node == null || node.isNull()) return null;
        if (node.isNumber()) {
            double v = node.asDouble();
            if (v > 1.0 && v <= 100.0) return v / 100.0;
            if (v < 0.0) return 0.0;
            if (v > 1.0) return 1.0;
            return v;
        }
        if (node.isTextual()) {
            String text = node.asText().trim().replace("%", "");
            try {
                double v = Double.parseDouble(text);
                if (v > 1.0 && v <= 100.0) return v / 100.0;
                return Math.max(0.0, Math.min(1.0, v));
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }

    public String complete(List<ChatMessageDto> messages) {
        return complete(null, messages);
    }

    public String complete(Long modelConfigId, List<ChatMessageDto> messages) {
        if (mockLlm) {
            return "（MOCK_LLM）模拟 Agent 回复。";
        }
        return callChatCompletions(modelConfigId, messages);
    }

    public String chat(List<ChatMessageDto> messages, String paperText, String context) {
        return chat(null, messages, paperText, context, null);
    }

    public String chat(List<ChatMessageDto> messages, String paperText, String context, String retrievedPassages) {
        return chat(null, messages, paperText, context, retrievedPassages);
    }

    public String chat(Long modelConfigId, List<ChatMessageDto> messages, String paperText, String context) {
        return chat(modelConfigId, messages, paperText, context, null);
    }

    /**
     * @param retrievedPassages 按用户问题从 embedding_chunk 检索出的原文段落（可为 null）。
     *
     * 上下文分三层，顺序有意为之：
     *   1. 章节骨架（SectionExcerpt）—— 让模型知道整篇论文长什么样
     *   2. 按问题检索的原文段落 —— 真正用来回答的依据，带页码
     *   3. 当前阅读上下文（当前页 / 选中文字 / 标注）
     * 原来只有 1 和 3，且 1 卡在 12000 字符，导致模型经常回答「我只看到第 1 页」。
     */
    public String chat(Long modelConfigId, List<ChatMessageDto> messages, String paperText, String context,
                       String retrievedPassages) {
        if (mockLlm) {
            return "（MOCK_LLM）我已收到你的问题。" +
                    (paperText == null || paperText.isBlank() ? "当前没有关联论文。" : "当前回复已模拟注入论文全文上下文。");
        }
        boolean hasRetrieval = retrievedPassages != null && !retrievedPassages.isBlank();
        List<ChatMessageDto> finalMessages = new ArrayList<>();
        if (paperText != null && !paperText.isBlank()) {
            // 有检索结果时骨架可以少给一些，把预算让给真正相关的原文。
            int skeletonBudget = hasRetrieval ? skeletonCharsWithRetrieval : skeletonCharsOnly;
            finalMessages.add(new ChatMessageDto("system",
                    "你是科研阅读助手。以下是关联论文的章节骨架（用于把握全文结构）：\n\n"
                            + SectionExcerpt.excerpt(paperText, skeletonBudget)));
        } else {
            finalMessages.add(new ChatMessageDto("system", "你是科研阅读助手。请用简洁、准确的中文回答。"));
        }
        if (hasRetrieval) {
            finalMessages.add(new ChatMessageDto("system",
                    "以下是按用户问题从全文中检索出的最相关原文段落（【p.N】为页码，请在回答中引用页码）。"
                            + "这些段落来自全文任意位置，不限于当前页 —— 回答时不要说「只看到第 N 页」：\n\n"
                            + truncate(retrievedPassages, retrievedCharsMax)));
        }
        if (context != null && !context.isBlank()) {
            finalMessages.add(new ChatMessageDto("system", "用户当前阅读上下文（当前页文本 / 选中文字 / 已有标注等）：\n" + truncate(context, 6000)));
        }
        finalMessages.addAll(messages == null ? List.of() : messages);
        return callChatCompletions(modelConfigId, finalMessages);
    }

    /** 当前生效的模型标识：mock 模式返回 "mock"（供 UI 显式标注「模拟输出」）。 */
    public Map<String, Object> consumeLastTokenUsage() {
        Map<String, Object> usage = lastTokenUsage.get();
        lastTokenUsage.set(Map.of());
        return usage == null ? Map.of() : usage;
    }

    public String currentModelId() {
        return llmClientFactory.currentModelId();
    }

    public ModelTestResult testConnection(Long modelConfigId) {
        return llmClientFactory.legacyTestModel(modelConfigId);
    }

    private String callChatCompletions(Long modelConfigId, List<ChatMessageDto> messages) {
        return callChatCompletions(modelConfigId, messages, null);
    }

    private String callChatCompletions(Long modelConfigId, List<ChatMessageDto> messages, Integer maxTokensOverride) {
        LlmResponse response = llmClientFactory.callLegacy(modelConfigId, messages, maxTokensOverride);
        lastTokenUsage.set(response.tokenUsage() == null ? Map.of() : response.tokenUsage());
        return response.content();
    }

    private ApiException classifyHttpFailure(RestClientResponseException ex) {
        int code = ex.getStatusCode().value();
        if (code == 401 || code == 403) {
            return new ApiException(HttpStatus.BAD_GATEWAY, code + " 鉴权失败：请检查 API Key 或 Provider 权限。");
        }
        if (code == 404) {
            return new ApiException(HttpStatus.BAD_GATEWAY, "404 模型或路径不存在：请检查 Base URL 与 Model Name。");
        }
        if (code == 408 || code == 504) {
            return new ApiException(HttpStatus.GATEWAY_TIMEOUT, code + " 请求超时：请检查网络或模型服务状态。");
        }
        if (code >= 500) {
            return new ApiException(HttpStatus.BAD_GATEWAY, code + " 模型服务端错误：请稍后重试或检查 Provider 状态。");
        }
        return new ApiException(HttpStatus.BAD_GATEWAY, code + " 请求被模型服务拒绝：请检查 Base URL / Model Name / 参数。响应摘录：" + truncate(sanitizeError(ex.getResponseBodyAsString()), 240));
    }

    private String classifyFailure(String message) {
        String msg = message == null ? "" : message.toLowerCase();
        if (msg.contains("鉴权") || msg.contains("401") || msg.contains("403")) return "auth_failed";
        if (msg.contains("404") || msg.contains("模型或路径不存在")) return "model_not_found";
        if (msg.contains("timeout") || msg.contains("超时")) return "timeout";
        if (msg.contains("network") || msg.contains("无法连接")) return "network_error";
        if (msg.contains("not configured") || msg.contains("缺失")) return "not_configured";
        if (msg.contains("服务端错误")) return "server_error";
        return "request_failed";
    }

    private String stripJsonFence(String raw) {
        String text = raw == null ? "" : raw.trim();
        if (text.startsWith("```")) {
            text = text.replaceFirst("^```(?:json)?\\s*", "");
            text = text.replaceFirst("\\s*```$", "");
        }
        return text.trim();
    }

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() <= maxChars ? text : text.substring(0, maxChars);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank() || value.equals("unknown");
    }

    private String stripTrailingSlash(String value) {
        return value.replaceAll("/+$", "");
    }

    private String sanitizeError(String value) {
        if (value == null) return "";
        return value.replaceAll("sk-[A-Za-z0-9_\\-]{8,}", "sk-[REDACTED]")
                .replaceAll("(?i)bearer\\s+[A-Za-z0-9._\\-]{12,}", "Bearer [REDACTED]");
    }
}
