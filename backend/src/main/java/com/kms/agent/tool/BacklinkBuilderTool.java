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
    @Override public String displayName() { return "双链建立"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "把源笔记中的纯文本目标标题改写为 Obsidian [[双链]]。"; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_NOTE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"sourcePath","string","源笔记路径。"); prop(s,"targetTitle","string","目标标题。"); required(s,"sourcePath","targetTitle"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return ToolResult.of(objectMapper.valueToTree(linkService.createLink(strArg(args,"sourcePath"), strArg(args,"targetTitle")))); }
}
