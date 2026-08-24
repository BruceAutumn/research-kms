package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.paper.PaperService;
import com.kms.paper.dto.PaperDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class SearchPapersTool extends AbstractJsonTool {
    private final PaperService paperService;

    public SearchPapersTool(PaperService paperService, ObjectMapper objectMapper) {
        super(objectMapper);
        this.paperService = paperService;
    }

    @Override public String name() { return "literature-search"; }
    @Override public String displayName() { return "文献搜索"; }
    @Override public String category() { return "Literature"; }
    @Override public String description() { return "按关键词、标签或 filter 搜索文献库，返回真实 papers 数据。"; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "q", "string", "标题/作者/摘要关键词，可空。");
        prop(s, "tag", "string", "标签，可空。");
        prop(s, "filter", "string", "all/recent/favorites/unread/ai_processed/ai_pending/trash 等。");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        List<PaperDto> papers = paperService.search(strArg(args, "q"), strArg(args, "tag"), strArg(args, "filter"));
        List<Map<String, Object>> rows = new ArrayList<>();
        for (PaperDto p : papers) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", p.id());
            row.put("title", p.title());
            row.put("authors", p.authors());
            row.put("journal", p.journal());
            row.put("year", p.year());
            row.put("doi", p.doi());
            row.put("aiStatus", p.aiStatus());
            row.put("tags", p.tags() == null ? List.of() : List.of(p.tags()));
            rows.add(row);
        }
        return ToolResult.of(objectMapper.valueToTree(Map.of("count", rows.size(), "papers", rows)));
    }
}
