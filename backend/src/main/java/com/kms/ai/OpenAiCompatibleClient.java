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
     * Phase 3/5 Structured Extraction: requireModelOutputwith confidence and group   JSON array. 
     * Long text uses SectionExcerpt Segment(Keep Abstract/Introduction/Methods/Conclusion chapter), 
     * Instead of truncating at N char. 
     */
    public List<ExtractedField> extractFields(String pdfText) {
        return extractFields(null, pdfText);
    }

    public List<ExtractedField> extractFields(Long modelConfigId, String pdfText) {
        if (mockLlm) {
            return List.of(
                    new ExtractedField("Title", "Cesium adsorption on Prussian blue analogues (Mock)", 0.97, "metadata"),
                    new ExtractedField("Authors", "Wang et al. (Mock)", 0.95, "metadata"),
                    new ExtractedField("Year", "2025", 0.99, "metadata"),
                    new ExtractedField("Journal", "Chemical Engineering Journal (Mock)", 0.93, "metadata"),
                    new ExtractedField("DOI", "10.1016/j.cej.2025.000000 (Mock)", 0.90, "metadata"),
                    new ExtractedField("Keywords", "cesium; adsorption; PBA; seawater", 0.92, "keywords"),
                    new ExtractedField("Abstract", "Mock abstract for extraction preview.", 0.88, "abstract"),
                    new ExtractedField("Material", "CuHCF", 0.89, "materials"),
                    new ExtractedField("Temperature", "298 K", 0.94, "conditions"),
                    new ExtractedField("pH", "7.4", 0.85, "conditions"),
                    new ExtractedField("Method", "Batch adsorption experiments; CV testing", 0.91, "methods"),
                    new ExtractedField("Capacity", "512 mg/g", 0.87, "results"),
                    new ExtractedField("Conclusion", "PBA To Cs+ has highSelectproperty", 0.86, "conclusions")
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
            return "(MOCK_LLM)Mock Agent Reply. ";
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
     * @param retrievedPassages By user question from embedding_chunk retrievedOriginaltextParagraph(Can be null). 
     *
     * Context in three layers, order intentional: 
     *   1. chapter skeleton(SectionExcerpt)-- Let model know whole paper
     *   2. Text segments by question -- really used forAnswerbasis, withPage Number
     *   3. Current reading context(currentPage / Selected Text / Annotation)
     * Originalonly had 1 and 3, and 1 Stuck at 12000 char, Causing model to often answer"I only see 1 Page". 
     */
    public String chat(Long modelConfigId, List<ChatMessageDto> messages, String paperText, String context,
                       String retrievedPassages) {
        if (mockLlm) {
            return "(MOCK_LLM)I got your question. " +
                    (paperText == null || paperText.isBlank() ? "currently no linkPaper. " : "Current reply mock-injected paper full text. ");
        }
        boolean hasRetrieval = retrievedPassages != null && !retrievedPassages.isBlank();
        List<ChatMessageDto> finalMessages = new ArrayList<>();
        if (paperText != null && !paperText.isBlank()) {
            // skeleton on resultsCangive lessOnesome, Give budget to truly relevant text. 
            int skeletonBudget = hasRetrieval ? skeletonCharsWithRetrieval : skeletonCharsOnly;
            finalMessages.add(new ChatMessageDto("system",
                    "You are a research reading assistant. below are relatedPaperchapter skeleton(used forConfidenceFull Textstructure): \n\n"
                            + SectionExcerpt.excerpt(paperText, skeletonBudget)));
        } else {
            finalMessages.add(new ChatMessageDto("system", "You are a research reading assistant. Please use concise, accurateChineseAnswer. "));
        }
        if (hasRetrieval) {
            finalMessages.add(new ChatMessageDto("system",
                    "below areBy user question fromFull Textinmost relevant retrievedOriginaltextParagraph([p.N]asPage Number, Please cite page numbers in answer). "
                            + "theseParagraphfromFull Textanywhere, not limited to currentPage -- Do not say when answering"Only see N Page": \n\n"
                            + truncate(retrievedPassages, retrievedCharsMax)));
        }
        if (context != null && !context.isBlank()) {
            finalMessages.add(new ChatMessageDto("system", "User reading context(currentPagetext / Selected Text / Existing annotations etc): \n" + truncate(context, 6000)));
        }
        finalMessages.addAll(messages == null ? List.of() : messages);
        return callChatCompletions(modelConfigId, finalMessages);
    }

    /** currently activeModelbadge: mock modeBack "mock"(provide UI explicitAnnotation"Mock Output").  */
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
            return new ApiException(HttpStatus.BAD_GATEWAY, code + " Auth Failed: Please check API Key or Provider Permission. ");
        }
        if (code == 404) {
            return new ApiException(HttpStatus.BAD_GATEWAY, "404 Model or path not found: Please check Base URL and Model Name. ");
        }
        if (code == 408 || code == 504) {
            return new ApiException(HttpStatus.GATEWAY_TIMEOUT, code + " Request timeout: Check network or model service. ");
        }
        if (code >= 500) {
            return new ApiException(HttpStatus.BAD_GATEWAY, code + " Model service error: Please retry later or check Provider state. ");
        }
        return new ApiException(HttpStatus.BAD_GATEWAY, code + " Request rejected by model service: Please check Base URL / Model Name / param. Response Excerpt: " + truncate(sanitizeError(ex.getResponseBodyAsString()), 240));
    }

    private String classifyFailure(String message) {
        String msg = message == null ? "" : message.toLowerCase();
        if (msg.contains("Auth") || msg.contains("401") || msg.contains("403")) return "auth_failed";
        if (msg.contains("404") || msg.contains("Model or path not found")) return "model_not_found";
        if (msg.contains("timeout") || msg.contains("timeout")) return "timeout";
        if (msg.contains("network") || msg.contains("cannot connect")) return "network_error";
        if (msg.contains("not configured") || msg.contains("Missing")) return "not_configured";
        if (msg.contains("Server Error")) return "server_error";
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
