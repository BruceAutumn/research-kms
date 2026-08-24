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

import java.util.*;

@Component
public class UpdatePaperMetadataTool extends AbstractJsonTool {
    private final PaperService paperService;

    public UpdatePaperMetadataTool(PaperService paperService, ObjectMapper objectMapper) {
        super(objectMapper);
        this.paperService = paperService;
    }

    @Override public String name() { return "update-paper-metadata"; }
    @Override public String displayName() { return "Update paper metadata"; }
    @Override public String category() { return "Literature"; }
    @Override public String description() { return "Update paper KV Metadata(merge or replace mode). "; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_METADATA; }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "paper_id", "integer", "Paper ID");
        prop(s, "mode", "string", "merge or replace(Default merge)");
        prop(s, "kv", "object", "key-valueTo");
        required(s, "paper_id", "kv");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        long paperId = longArg(args, "paper_id");
        String mode = strArg(args, "mode");
        JsonNode kvNode = args.get("kv");
        List<MetadataDto> fields = new ArrayList<>();
        if (kvNode != null && kvNode.isObject()) {
            kvNode.fields().forEachRemaining(e -> fields.add(new MetadataDto(e.getKey(), e.getValue().asText())));
        }
        if ("replace".equalsIgnoreCase(mode)) {
            paperService.replaceMetadata(paperId, fields);
        } else {
            List<MetadataDto> existing = paperService.getMetadata(paperId);
            Map<String, String> merged = new LinkedHashMap<>();
            for (MetadataDto m : existing) merged.put(m.key(), m.value());
            for (MetadataDto m : fields) merged.put(m.key(), m.value());
            List<MetadataDto> mergedList = new ArrayList<>();
            merged.forEach((k, v) -> mergedList.add(new MetadataDto(k, v)));
            paperService.replaceMetadata(paperId, mergedList);
        }
        return ToolResult.of(objectMapper.createObjectNode().put("paperId", paperId).put("updated", true));
    }
}