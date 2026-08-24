package com.kms.literature.dto;

import java.time.OffsetDateTime;

public record AiExtractionDto(
        Long id,
        Long paperId,
        String field,
        String fieldGroup,
        String originalValue,
        String extractedValue,
        Double confidence,
        String status,
        String userValue,
        String modelUsed,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}
