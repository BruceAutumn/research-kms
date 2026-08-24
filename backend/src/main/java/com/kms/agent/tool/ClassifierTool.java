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
    @Override public String displayName() { return "文本分类"; }
    @Override public String description() { return "用当前 Model 对文本做简短分类并给出理由。"; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"请对文本进行分类，输出 JSON：{category, reason, confidence}。"); }
}
