package com.kms.agent.tool;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.vault.VaultService;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class DatabaseWriterTool extends AbstractJsonTool {
    private final VaultService vaultService;
    public DatabaseWriterTool(VaultService vaultService, ObjectMapper objectMapper) { super(objectMapper); this.vaultService=vaultService; }
    @Override public String name() { return "database-writer"; }
    @Override public String displayName() { return "Properties 写入"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "修改 Vault 笔记 frontmatter Properties，底层走 VaultService.saveProperties。"; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_NOTE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"path","string","Vault 笔记路径。"); prop(s,"properties","object","完整 properties 对象。"); prop(s,"baseMtime","integer","冲突检测 mtime。"); required(s,"path","properties"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        Map<String,Object> props = args != null && args.has("properties") ? objectMapper.convertValue(args.get("properties"), new TypeReference<Map<String,Object>>() {}) : new LinkedHashMap<>();
        Long baseMtime = args != null && args.has("baseMtime") && args.get("baseMtime").isNumber() ? args.get("baseMtime").asLong() : null;
        return ToolResult.of(objectMapper.valueToTree(vaultService.saveProperties(strArg(args,"path"), props, baseMtime)));
    }
}
