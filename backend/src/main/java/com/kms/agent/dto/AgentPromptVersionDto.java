package com.kms.agent.dto;

import java.time.OffsetDateTime;

public record AgentPromptVersionDto(Long id, Long agentId, Integer version, String prompt, OffsetDateTime createdAt) {}
