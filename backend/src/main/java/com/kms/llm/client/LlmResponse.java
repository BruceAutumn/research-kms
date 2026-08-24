package com.kms.llm.client;

import java.util.Map;

public record LlmResponse(String content, Map<String, Object> tokenUsage) {
}
