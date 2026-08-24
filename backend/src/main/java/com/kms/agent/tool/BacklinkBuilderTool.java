package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.vault.LinkService;
import org.springframework.stereotype.Component;

@Component
public class BacklinkBuilderTool extends AbstractJsonTool {
    private final LinkService linkService;
    public BacklinkBuilderTool(LinkService linkService, ObjectMapper objectMapper) { super(objectMapper); this.linkService=linkService; }
    @Override public String name() { return "backlink-builder"; }
    @Override public String displayName() { return "Backlink Build"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "sourceNoteinplain text targetTitlerewrite to Obsidian [[backlink]]. "; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_NOTE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"sourcePath","string","Source Note Path. "); prop(s,"targetTitle","string","targetTitle. "); required(s,"sourcePath","targetTitle"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return ToolResult.of(objectMapper.valueToTree(linkService.createLink(strArg(args,"sourcePath"), strArg(args,"targetTitle")))); }
}
