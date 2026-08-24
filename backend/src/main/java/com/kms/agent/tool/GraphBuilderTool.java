package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.vault.GraphService;
import org.springframework.stereotype.Component;

@Component
public class GraphBuilderTool extends AbstractJsonTool {
    private final GraphService graphService;
    public GraphBuilderTool(GraphService graphService, ObjectMapper objectMapper) { super(objectMapper); this.graphService=graphService; }
    @Override public String name() { return "graph-builder"; }
    @Override public String displayName() { return "Knowledge Graph Read"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "Read Vault Global or local graph data(nodes/edges). "; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_VAULT; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"path","string","provide path whenBack local graph; otherwise global. "); prop(s,"depth","integer","local graph depth 1-3. "); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { String path=strArg(args,"path"); return ToolResult.of(objectMapper.valueToTree(path.isBlank()?graphService.global():graphService.local(path, intArg(args,"depth",1)))); }
}
