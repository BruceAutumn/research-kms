package com.kms.ai.dto;

import java.time.OffsetDateTime;

public record ModelConfigDto(
        Long id,
        String name,
        String provider,
        String baseUrl,
        String apiKey,
        boolean hasApiKey,
        String modelName,
        Double temperature,
        Integer maxTokens,
        Integer contextWindow,
        String embeddingModel,
        boolean isDefault,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
