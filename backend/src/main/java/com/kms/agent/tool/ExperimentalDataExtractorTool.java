package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class ExperimentalDataExtractorTool extends ExtractMetadataTool {
    public ExperimentalDataExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "experimental-data-extractor"; }
    @Override public String displayName() { return "实验数据提取"; }
    @Override public String description() { return "提取实验条件、材料类型和关键结果，结果进入 ai_extraction(PENDING) 等待审阅。"; }
}
