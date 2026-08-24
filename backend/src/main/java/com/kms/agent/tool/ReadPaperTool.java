package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.paper.Paper;
import com.kms.paper.PaperService;
import com.kms.paper.dto.MetadataDto;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Component
public class ReadPaperTool extends AbstractJsonTool {
    private static final int DEFAULT_EXCERPT_CHARS = 8000;
    private final PaperService paperService;

    public ReadPaperTool(PaperService paperService, ObjectMapper objectMapper) {
        super(objectMapper);
        this.paperService = paperService;
    }

    @Override public String name() { return "pdf-reader"; }
    @Override public String displayName() { return "PDF 全文读取"; }
    @Override public String category() { return "Literature"; }
    @Override public String description() { return "读取 papers.pdf_text 中已抽取的论文全文/摘录，不重新解析 PDF。"; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "id", "integer", "Paper ID。必填。");
        prop(s, "maxChars", "integer", "返回全文截断字符数，默认 8000。");
        required(s, "id");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        long id = longArg(args, "id");
        Paper paper = paperService.findPaper(id);
        List<MetadataDto> metadata = paperService.getMetadata(id);
        List<Map<String, String>> metaRows = new ArrayList<>();
        for (MetadataDto m : metadata) metaRows.add(Map.of("key", value(m.key()), "value", value(m.value())));
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("id", paper.getId());
        result.put("title", paper.getTitle());
        result.put("authors", paper.getAuthors());
        result.put("journal", paper.getJournal());
        result.put("year", paper.getYear());
        result.put("doi", paper.getDoi());
        result.put("abstract", paper.getAbstractText());
        result.put("metadata", metaRows);
        result.put("pdfTextChars", paper.getPdfText() == null ? 0 : paper.getPdfText().length());
        result.put("text", truncate(paper.getPdfText(), Math.max(1000, intArg(args, "maxChars", DEFAULT_EXCERPT_CHARS))));
        return ToolResult.of(objectMapper.valueToTree(result));
    }

    private String truncate(String text, int maxChars) { return text == null ? "" : text.length() <= maxChars ? text : text.substring(0, maxChars); }
    private String value(String s) { return s == null ? "" : s; }
}
