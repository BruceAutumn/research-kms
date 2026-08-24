package com.kms.agent;

import java.util.List;
import java.util.Map;

public record ToolContext(
        Long agentId,
        Long runId,
        Long modelConfigId,
        List<Map<String, Object>> contextRefs
) {
    public static ToolContext empty() {
        return new ToolContext(null, null, null, List.of());
    }
}
