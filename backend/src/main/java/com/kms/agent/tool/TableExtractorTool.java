package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class TableExtractorTool extends ExtractMetadataTool {
    public TableExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "table-extractor"; }
    @Override public String displayName() { return "表格数据提取"; }
    @Override public String description() { return "从论文中提取表格/数值线索，结果进入 ai_extraction(PENDING) 等待审阅。"; }
}
