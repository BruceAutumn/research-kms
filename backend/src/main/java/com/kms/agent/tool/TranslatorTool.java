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
    @Override public String displayName() { return "翻译"; }
    @Override public String description() { return "用当前 Model 翻译输入文本，默认译为中文并保留术语。"; }
    @Override public ToolResult execute(ToolContext ctx, JsonNode args) { return run(ctx,args,"请把文本翻译为中文，保留专业术语、公式和引用编号。"); }
}
