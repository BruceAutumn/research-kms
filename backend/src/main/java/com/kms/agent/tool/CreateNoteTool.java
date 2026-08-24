package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.vault.VaultService;
import org.springframework.stereotype.Component;

@Component
public class CreateNoteTool extends AbstractJsonTool {
    private final VaultService vaultService;
    public CreateNoteTool(VaultService vaultService, ObjectMapper objectMapper) { super(objectMapper); this.vaultService = vaultService; }
    @Override public String name() { return "note-writer"; }
    @Override public String displayName() { return "笔记写入"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "创建或更新 Vault Markdown 笔记；所有写入走 VaultService，受路径防护与索引同步保护。"; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.CREATE_NOTE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"parentPath","string","创建时的 Vault 文件夹路径。"); prop(s,"title","string","新笔记标题。"); prop(s,"content","string","Markdown 内容。"); prop(s,"path","string","若提供则更新已有文件。"); prop(s,"baseMtime","integer","更新已有文件时的冲突检测 mtime。"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        String path = strArg(args, "path");
        String content = strArg(args, "content");
        if (!path.isBlank()) {
            Long baseMtime = args != null && args.has("baseMtime") && args.get("baseMtime").isNumber() ? args.get("baseMtime").asLong() : null;
            return ToolResult.of(objectMapper.valueToTree(vaultService.saveFile(path, content, baseMtime)));
        }
        return ToolResult.of(objectMapper.valueToTree(vaultService.createNote(strArg(args, "parentPath"), strArg(args, "title"), content)));
    }
}
