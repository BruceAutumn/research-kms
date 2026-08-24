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
    @Override public String displayName() { return "摘要生成"; }
    @Override public String description() { return "用当前 Model 对输入文本生成中文科研摘要。"; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"请生成简洁、准确的中文科研摘要，保留关键对象、方法和结论。"); }
}
