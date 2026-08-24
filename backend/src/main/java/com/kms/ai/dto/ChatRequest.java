package com.kms.ai.dto;

import java.util.List;

public record ChatRequest(Long paperId, List<ChatMessageDto> messages, String context, Boolean thinking, Boolean webSearch, String effort) {
}
