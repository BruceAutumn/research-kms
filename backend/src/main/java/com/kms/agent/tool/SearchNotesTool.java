package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.vault.LinkService;
import com.kms.vault.VaultIndexService;
import com.kms.vault.VaultService;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

@Component
public class SearchNotesTool extends AbstractJsonTool {
    private final VaultIndexService indexService;
    private final VaultService vaultService;
    private final LinkService linkService;
    public SearchNotesTool(VaultIndexService indexService, VaultService vaultService, LinkService linkService, ObjectMapper objectMapper) {
        super(objectMapper); this.indexService=indexService; this.vaultService=vaultService; this.linkService=linkService;
    }
    @Override public String name() { return "note-reader"; }
    @Override public String displayName() { return "笔记读取"; }
    @Override public String category() { return "Knowledge"; }
    @Override public String description() { return "搜索 Vault 笔记，或按 path 读取笔记正文/属性/反链。"; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_VAULT; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"q","string","全文搜索关键词，可空。"); prop(s,"path","string","Vault 相对路径；提供时读取该文件。"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        String path = strArg(args, "path");
        if (!path.isBlank()) {
            Map<String,Object> result = new LinkedHashMap<>(vaultService.readFile(path));
            result.put("backlinks", linkService.backlinks(path));
            result.put("outgoing", linkService.outgoing(path));
            return ToolResult.of(objectMapper.valueToTree(result));
        }
        var rows = indexService.search(strArg(args, "q"));
        return ToolResult.of(objectMapper.valueToTree(Map.of("count", rows.size(), "notes", rows)));
    }
}
