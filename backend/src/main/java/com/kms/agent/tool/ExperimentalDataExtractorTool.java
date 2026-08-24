package com.kms.agent.tool;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;
import com.kms.paper.PaperService;

@Component
public class ExperimentalDataExtractorTool extends ExtractMetadataTool {
    public ExperimentalDataExtractorTool(PaperService paperService, ObjectMapper objectMapper) { super(paperService, objectMapper); }
    @Override public String name() { return "experimental-data-extractor"; }
    @Override public String displayName() { return "Experiment Data Extraction"; }
    @Override public String description() { return "Extract Experimental Conditions, Material types and key results, result enters ai_extraction(PENDING) Awaiting Review. "; }
}
