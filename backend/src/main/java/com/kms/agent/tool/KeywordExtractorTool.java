package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class KeywordExtractorTool extends ExtractMetadataTool {
    public KeywordExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "keyword-extractor"; }
    @Override public String displayName() { return "关键词提取"; }
    @Override public String description() { return "提取关键词/主题标签，结果同样进入 ai_extraction(PENDING) 等待审阅。"; }
}
