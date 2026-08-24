package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.ai.OpenAiCompatibleClient;
import org.springframework.stereotype.Component;

@Component
public class SummarizerTool extends AiTextTool {
    public SummarizerTool(OpenAiCompatibleClient llm, ObjectMapper objectMapper) { super(llm, objectMapper); }
    @Override public String name() { return "summarizer"; }
    @Override public String displayName() { return "Abstract Generation"; }
    @Override public String description() { return "use current Model Generate Chinese research abstract for input. "; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"Please generate concise, accurateChineseresearchAbstract, Keep key objects, methodandConclusion. "); }
}
