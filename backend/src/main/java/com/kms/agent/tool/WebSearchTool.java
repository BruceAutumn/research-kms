package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class WebSearchTool extends AbstractJsonTool {
    private final RestClient.Builder restClientBuilder;

    public WebSearchTool(ObjectMapper objectMapper, RestClient.Builder restClientBuilder) {
        super(objectMapper);
        this.restClientBuilder = restClientBuilder;
    }
    @Override public String name() { return "web-search"; }
    @Override public String displayName() { return "学术联网搜索"; }
    @Override public String category() { return "External"; }
    @Override public String description() { return "通过 Crossref 联网检索学术作品，返回标题、作者、年份、DOI 与来源链接。"; }
    @Override public PermissionKey permissionKey() { return PermissionKey.NETWORK; }
    @Override public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "q", "string", "论文标题、作者、主题或关键词。");
        prop(s, "limit", "integer", "结果数量，1-10，默认 5。");
        required(s, "q");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        String query = strArg(args, "q").trim();
        if (query.isBlank()) {
            return ToolResult.message("搜索关键词不能为空。");
        }
        int limit = Math.max(1, Math.min(10, intArg(args, "limit", 5)));
        try {
            JsonNode response = restClientBuilder.build()
                    .get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("api.crossref.org")
                            .path("/works")
                            .queryParam("query", query)
                            .queryParam("rows", limit)
                            .build())
                    .header("User-Agent", "ResearchKMS/1.0 (mailto:research-kms@example.com)")
                    .retrieve()
                    .body(JsonNode.class);

            List<Map<String, Object>> results = new ArrayList<>();
            JsonNode items = response == null ? null : response.path("message").path("items");
            if (items != null && items.isArray()) {
                for (JsonNode item : items) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("title", firstArrayText(item.path("title")));
                    row.put("authors", authors(item.path("author")));
                    row.put("year", year(item.path("published").path("date-parts")));
                    row.put("doi", item.path("DOI").asText(""));
                    row.put("publisher", item.path("publisher").asText(""));
                    row.put("url", item.path("URL").asText(""));
                    results.add(row);
                }
            }
            return ToolResult.of(objectMapper.valueToTree(Map.of(
                    "query", query,
                    "source", "Crossref",
                    "count", results.size(),
                    "results", results
            )));
        } catch (RestClientException ex) {
            return ToolResult.message("Crossref 搜索失败：" + ex.getMessage());
        }
    }

    private String firstArrayText(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) return "";
        return node.get(0).asText("");
    }

    private List<String> authors(JsonNode node) {
        List<String> names = new ArrayList<>();
        if (node == null || !node.isArray()) return names;
        for (JsonNode author : node) {
            String name = (author.path("given").asText("") + " " + author.path("family").asText("")).trim();
            if (!name.isBlank()) names.add(name);
        }
        return names;
    }

    private Integer year(JsonNode node) {
        if (node == null || !node.isArray() || node.isEmpty()) return null;
        JsonNode first = node.get(0);
        return first != null && first.isArray() && !first.isEmpty() && first.get(0).canConvertToInt()
                ? first.get(0).asInt()
                : null;
    }
}
