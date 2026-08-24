package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.ai.OpenAiCompatibleClient;
import com.kms.ai.dto.ChatMessageDto;

import java.util.List;
import java.util.Map;

abstract class AiTextTool extends AbstractJsonTool {
    protected final OpenAiCompatibleClient llm;
    protected AiTextTool(OpenAiCompatibleClient llm, ObjectMapper objectMapper) { super(objectMapper); this.llm=llm; }
    @Override public String category() { return "AI"; }
    @Override public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }
    @Override public JsonNode parameterSchema() { ObjectNode s=schema(); prop(s,"text","string","Input Text. "); prop(s,"instruction","string","extra requirement, Nullable. "); required(s,"text"); return s; }
    protected ToolResult run(ToolContext ctx, JsonNode args, String system) {
        String result = llm.complete(ctx == null ? null : ctx.modelConfigId(), List.of(
                new ChatMessageDto("system", system),
                new ChatMessageDto("user", strArg(args,"text") + "\n\n" + strArg(args,"instruction"))
        ));
        return ToolResult.of(objectMapper.valueToTree(Map.of("text", result)), llm.consumeLastTokenUsage());
    }
}
