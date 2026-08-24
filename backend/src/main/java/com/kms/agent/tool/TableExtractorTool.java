package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class TableExtractorTool extends ExtractMetadataTool {
    public TableExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "table-extractor"; }
    @Override public String displayName() { return "Table Data Extraction"; }
    @Override public String description() { return "Extract tables from paper/Numeric Clues, result enters ai_extraction(PENDING) Awaiting Review. "; }
}
