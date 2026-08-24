package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.Map;

public record ToolResult(JsonNode output, String message, Map<String, Object> tokenUsage) {
    public ToolResult(JsonNode output, String message) {
        this(output, message, Map.of());
    }

    public static ToolResult of(JsonNode output) {
        return new ToolResult(output, null, Map.of());
    }

    public static ToolResult of(JsonNode output, Map<String, Object> tokenUsage) {
        return new ToolResult(output, null, tokenUsage == null ? Map.of() : tokenUsage);
    }

    public static ToolResult message(String message) {
        ObjectNode node = JsonNodeFactory.instance.objectNode();
        node.put("message", message == null ? "" : message);
        return new ToolResult(node, message, Map.of());
    }

    public String asJson(ObjectMapper mapper) {
        try {
            if (output != null) return mapper.writeValueAsString(output);
            ObjectNode node = mapper.createObjectNode();
            node.put("message", message == null ? "" : message);
            return mapper.writeValueAsString(node);
        } catch (Exception ex) {
            return "{\"error\":\"" + ex.getMessage().replace("\"", "'") + "\"}";
        }
    }
}
