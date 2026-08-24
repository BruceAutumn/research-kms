package com.kms.agent.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class RunDtos {
    private RunDtos() {}
    public record RunCreateResponse(Long runId) {}
    public record PermissionRequest(Boolean allow, Boolean alwaysAllow) {}
    public record RunStepDto(Long id, Long runId, Integer stepOrder, String toolName, String eventType, String status,
                             String message, Map<String,Object> input, Map<String,Object> output, String error,
                             Long durationMs, Map<String,Object> tokenUsage, OffsetDateTime createdAt) {}
    public record RunDto(Long id, Long agentId, String status, String input, List<Map<String,Object>> contextRefs,
                         Long modelConfigId, Long llmModelId, OffsetDateTime startedAt, OffsetDateTime finishedAt,
                         Map<String,Object> tokenUsage, String error, List<RunStepDto> steps) {}
}
