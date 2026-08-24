package com.kms.agent.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;

public final class WorkflowDtos {
    private WorkflowDtos() {}
    public static class WorkflowRequest { public String name; public String description; public List<WorkflowStepRequest> steps; }
    public static class WorkflowStepRequest { public Long id; public Integer stepOrder; public String toolName; public String prompt; public Map<String,Object> inputMapping; public String outputKey; public String condition; public Map<String,Object> retryPolicy; public Boolean enabled; }
    public record WorkflowDto(Long id, String name, String description, OffsetDateTime createdAt, OffsetDateTime updatedAt, List<WorkflowStepDto> steps) {}
    public record WorkflowStepDto(Long id, Long workflowId, Integer stepOrder, String toolName, String prompt, Map<String,Object> inputMapping, String outputKey, String condition, Map<String,Object> retryPolicy, boolean enabled) {}
}
