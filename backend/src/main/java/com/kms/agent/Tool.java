package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

/**
 * Agent 可调用工具。ToolRegistry 是唯一事实源：前端工具清单、LLM prompt、/api/plugins 都从这里派生。
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

    /** Map 参数兼容入口：旧工具调用方仍可复用。 */
    default String execute(Map<String, Object> args) {
        ObjectMapper mapper = new ObjectMapper();
        return execute(ToolContext.empty(), mapper.valueToTree(args == null ? Map.of() : args)).asJson(mapper);
    }
}
