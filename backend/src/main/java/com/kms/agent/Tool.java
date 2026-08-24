package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

/**
 * Agent Callable Tools. ToolRegistry is sole source of truth: Frontend Tool List, LLM prompt, /api/plugins all frominderive. 
 */
public interface Tool {
    String name();
    String displayName();
    String category();
    String description();
    JsonNode parameterSchema();
    boolean isWriteOperation();
    PermissionKey permissionKey();
    ToolResult execute(ToolContext ctx, JsonNode args);

    /** Map paramCompatentry: Old tool callers still work.  */
    default String execute(Map<String, Object> args) {
        ObjectMapper mapper = new ObjectMapper();
        return execute(ToolContext.empty(), mapper.valueToTree(args == null ? Map.of() : args)).asJson(mapper);
    }
}
