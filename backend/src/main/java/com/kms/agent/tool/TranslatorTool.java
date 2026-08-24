package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.ai.OpenAiCompatibleClient;
import org.springframework.stereotype.Component;

@Component
public class TranslatorTool extends AiTextTool {
    public TranslatorTool(OpenAiCompatibleClient llm, ObjectMapper objectMapper) { super(llm, objectMapper); }
    @Override public String name() { return "translator"; }
    @Override public String displayName() { return "translate"; }
    @Override public String description() { return "use current Model translateInput Text, Default translate to Chinese keeping terms. "; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"Please translate text to Chinese, Keep terms, Formula and reference number. "); }
}
