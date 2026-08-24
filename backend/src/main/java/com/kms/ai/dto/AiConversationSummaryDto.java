package com.kms.ai.dto;

import java.time.OffsetDateTime;

public record AiConversationSummaryDto(
        Long id,
        String title,
        OffsetDateTime updatedAt,
        Long messageCount
) {
}
