package com.kms.agent.dto;

import java.time.OffsetDateTime;
import java.util.Map;

public record AgentDto(
        Long id,
        Long userId,
        String name,
        String model,
        String prompt,
        String[] tools,
        OffsetDateTime createdAt,
        Long modelConfigId,
        Long llmModelId,
        Map<String, Object> knowledgeScope,
        Map<String, Object> memoryConfig,
        Map<String, Object> outputConfig,
        Map<String, Object> permissions,
        Long workflowId,
        Map<String, Object> advanced,
        boolean pinned,
        String icon,
        String description
) {}
