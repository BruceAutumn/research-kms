package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class WebSearchTool extends AbstractJsonTool {
    public WebSearchTool(ObjectMapper objectMapper) { super(objectMapper); }
    @Override public String name() { return "web-search"; }
    @Override public String displayName() { return "Web search"; }
    @Override public String category() { return "External"; }
    @Override public String description() { return "web search placeholderTool; Backend has no search configured Provider, thus no fake result. "; }
    @Override public PermissionKey permissionKey() { return PermissionKey.NETWORK; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"q","string","Search Keywords. "); required(s,"q"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return ToolResult.of(objectMapper.valueToTree(Map.of("query", strArg(args,"q"), "results", java.util.List.of(), "message", "web-search provider not configured"))); }
}
