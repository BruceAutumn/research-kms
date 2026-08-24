package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.paper.PaperService;
import com.kms.paper.dto.PaperDto;
import com.kms.paper.dto.PaperUpdateRequest;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

@Component
public class AddTagTool extends AbstractJsonTool {
    private final PaperService paperService;
    public AddTagTool(PaperService paperService, ObjectMapper objectMapper) { super(objectMapper); this.paperService=paperService; }
    @Override public String name() { return "paper-tagger"; }
    @Override public String displayName() { return "Paper Tag Write"; }
    @Override public String category() { return "Extraction"; }
    @Override public String description() { return "Append tag to paper, Write papers.tags. "; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_METADATA; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"id","integer","Paper ID. Required. "); ObjectNode tags=prop(s,"tags","array","wantAppend Tagarray. "); tags.putObject("items").put("type","string"); required(s,"id","tags"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        long id=longArg(args,"id");
        Set<String> merged=new LinkedHashSet<>();
        PaperDto paper=paperService.get(id);
        if(paper.tags()!=null) for(String tag:paper.tags()) if(tag!=null&&!tag.isBlank()) merged.add(tag.trim());
        JsonNode tags=args==null?null:args.get("tags");
        if(tags!=null&&tags.isArray()) tags.forEach(t->{ if(!t.asText("").isBlank()) merged.add(t.asText().trim()); });
        PaperUpdateRequest update=new PaperUpdateRequest();
        update.setTags(merged.toArray(new String[0]));
        PaperDto saved=paperService.update(id, update);
        return ToolResult.of(objectMapper.valueToTree(Map.of("id", saved.id(), "tags", saved.tags()==null? List.of():List.of(saved.tags()))));
    }
}
