package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class KeywordExtractorTool extends ExtractMetadataTool {
    public KeywordExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "keyword-extractor"; }
    @Override public String displayName() { return "Keyword Extraction"; }
    @Override public String description() { return "Extract Keywords/Topic Tag, result also enters ai_extraction(PENDING) Awaiting Review. "; }
}
