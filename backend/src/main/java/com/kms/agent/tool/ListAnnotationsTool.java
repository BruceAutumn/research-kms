package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.literature.Annotation;
import com.kms.literature.AnnotationService;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class ListAnnotationsTool extends AbstractJsonTool {
    private final AnnotationService annotationService;

    public ListAnnotationsTool(AnnotationService annotationService, ObjectMapper objectMapper) {
        super(objectMapper);
        this.annotationService = annotationService;
    }

    @Override public String name() { return "list-annotations"; }
    @Override public String displayName() { return "List Annotations"; }
    @Override public String category() { return "Literature"; }
    @Override public String description() { return "List all annotations of paper/Highlight. "; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "paper_id", "integer", "Paper ID");
        prop(s, "color", "string", "Filter by color(Optional)");
        required(s, "paper_id");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        long paperId = longArg(args, "paper_id");
        String color = strArg(args, "color");
        List<Annotation> annotations = annotationService.list(paperId);
        if (!color.isBlank()) {
            annotations = annotations.stream().filter(a -> color.equals(a.getColor())).toList();
        }
        return ToolResult.of(objectMapper.valueToTree(annotations.stream().map(a ->
                java.util.Map.of("id", a.getId(), "page", a.getPage(), "type", a.getType() != null ? a.getType() : "highlight",
                        "color", a.getColor() != null ? a.getColor() : "yellow", "text", a.getSelectedText() != null ? a.getSelectedText() : "",
                        "comment", a.getComment() != null ? a.getComment() : "")
        ).toList()));
    }
}