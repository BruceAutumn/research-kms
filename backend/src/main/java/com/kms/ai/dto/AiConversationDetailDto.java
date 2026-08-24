package com.kms.ai.dto;

import java.time.OffsetDateTime;
import java.util.List;

public record AiConversationDetailDto(
        Long id,
        String title,
        OffsetDateTime updatedAt,
        Long messageCount,
        List<ChatMessageDto> messages
) {
}
