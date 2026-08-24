package com.kms.ai.dto;

import java.util.List;
import java.util.Map;

public record ChatStreamRequest(
        Long conversationId,
        Long modelId,
        List<ChatMessageDto> messages,
        List<Map<String, Object>> contextRefs,
        Boolean thinking,
        Boolean webSearch,
        String effort
) {
}
