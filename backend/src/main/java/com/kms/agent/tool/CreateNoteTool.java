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
    @Override public String displayName() { return "Note Write"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "Create or Update Vault Markdown Note; allWritego VaultService, receivePathPreventprotectandIndexSyncprotect. "; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.CREATE_NOTE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"parentPath","string","On create Vault Folder Path. "); prop(s,"title","string","New Note Title. "); prop(s,"content","string","Markdown content. "); prop(s,"path","string","If provided update existing file. "); prop(s,"baseMtime","integer","Conflict detection on update existing mtime. "); return s; }
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
