package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.paper.Paper;
import com.kms.paper.PaperService;
import org.springframework.stereotype.Component;

import java.util.Map;

@Component
public class CitationReaderTool extends AbstractJsonTool {
    private final PaperService paperService;
    public CitationReaderTool(PaperService paperService, ObjectMapper objectMapper) { super(objectMapper); this.paperService = paperService; }
    @Override public String name() { return "citation-reader"; }
    @Override public String displayName() { return "Reference info read"; }
    @Override public String category() { return "Literature"; }
    @Override public String description() { return "Read citation fields of paper(Author, Journal, Year, DOI, URL). "; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"id","integer","Paper ID. Required. "); required(s,"id"); return s; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) {
        Paper p = paperService.findPaper(longArg(args, "id"));
        return ToolResult.of(objectMapper.valueToTree(Map.of(
                "id", p.getId(), "title", n(p.getTitle()), "authors", n(p.getAuthors()), "journal", n(p.getJournal()),
                "year", p.getYear(), "doi", n(p.getDoi()), "volume", n(p.getVolume()), "pages", n(p.getPages()), "url", n(p.getUrl())
        )));
    }
    private String n(String v){ return v == null ? "" : v; }
}
