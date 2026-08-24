package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.paper.PaperService;
import com.kms.paper.dto.MetadataDto;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ExtractMetadataTool extends AbstractJsonTool {
    private final PaperService paperService;
    public ExtractMetadataTool(PaperService paperService, ObjectMapper objectMapper) { super(objectMapper); this.paperService = paperService; }
    @Override public String name() { return "metadata-extractor"; }
    @Override public String displayName() { return "Metadata 提取"; }
    @Override public String category() { return "Extraction"; }
    @Override public String description() { return "从论文全文提取结构化 metadata，并落 ai_extraction(PENDING)，不直接写 papers。"; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_METADATA; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"id","integer","Paper ID。必填。"); required(s,"id"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        long id = longArg(args, "id");
        List<MetadataDto> fields = paperService.extractMetadata(id).fields();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("paperId", id);
        result.put("status", "PENDING_REVIEW");
        result.put("fields", fields.stream().map(f -> Map.of("key", n(f.key()), "value", n(f.value()))).toList());
        return ToolResult.of(objectMapper.valueToTree(result));
    }
    private String n(String v){ return v == null ? "" : v; }
}
