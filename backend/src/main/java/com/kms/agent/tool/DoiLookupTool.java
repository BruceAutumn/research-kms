package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.literature.LiteratureImportService;
import org.springframework.stereotype.Component;

@Component
public class DoiLookupTool extends AbstractJsonTool {
    private final LiteratureImportService importService;
    public DoiLookupTool(LiteratureImportService importService, ObjectMapper objectMapper) { super(objectMapper); this.importService=importService; }
    @Override public String name() { return "doi-lookup"; }
    @Override public String displayName() { return "DOI / Crossref Query"; }
    @Override public String category() { return "External"; }
    @Override public String description() { return "Call Phase 3 Crossref DOI import capability, Rootdata DOI Create/BackPaperrecord. "; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.NETWORK; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"doi","string","DOI. Required. "); required(s,"doi"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return ToolResult.of(objectMapper.valueToTree(importService.importDoi(strArg(args,"doi")))); }
}
