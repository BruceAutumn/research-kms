package com.kms.llm.client;

import com.kms.ai.dto.ChatMessageDto;

import java.util.List;

public record LlmRequest(Long modelId, List<ChatMessageDto> messages, Integer maxTokens) {
}
