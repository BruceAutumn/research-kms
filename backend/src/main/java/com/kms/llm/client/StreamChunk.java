package com.kms.llm.client;

import java.util.Map;

public record StreamChunk(String delta, Map<String, Object> tokenUsage) {
}
