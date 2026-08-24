package com.kms.llm.dto;

import java.time.OffsetDateTime;

public record LlmModelDto(
        Long id,
        Long providerId,
        String providerName,
        String providerKind,
        String modelId,
        String displayName,
        Integer contextWindow,
        boolean supportsTools,
        boolean supportsStream,
        boolean isDefault,
        boolean enabled,
        String capability,
        OffsetDateTime createdAt
) {
}
