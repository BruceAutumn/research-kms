package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.ai.OpenAiCompatibleClient;
import org.springframework.stereotype.Component;

@Component
public class ClassifierTool extends AiTextTool {
    public ClassifierTool(OpenAiCompatibleClient llm, ObjectMapper objectMapper) { super(llm, objectMapper); }
    @Override public String name() { return "classifier"; }
    @Override public String displayName() { return "text classify"; }
    @Override public String description() { return "use current Model Classify text briefly with reason. "; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"Please classify the text, Output JSON: {category, reason, confidence}. "); }
}
