package com.kms.llm.dto;

import java.time.OffsetDateTime;
import java.util.Map;

public record LlmProviderDto(
        Long id,
        String name,
        String kind,
        String baseUrl,
        String keyMasked,
        boolean hasApiKey,
        Map<String, Object> extraHeaders,
        String notes,
        boolean enabled,
        long modelCount,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
