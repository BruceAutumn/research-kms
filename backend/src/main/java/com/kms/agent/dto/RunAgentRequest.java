package com.kms.agent.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;
import java.util.Map;

/** 发起一次 Agent 运行的请求。contextRefs 只传引用，全文由后端按引用解析注入。 */
public record RunAgentRequest(
        @JsonAlias("input")
        String instruction,
        Long agentId,
        Long modelConfigId,
        @JsonAlias({"modelId", "llmModelId"})
        Long llmModelId,
        List<Map<String, Object>> contextRefs
) {
    public Long effectiveLlmModelId() {
        return llmModelId != null ? llmModelId : modelConfigId;
    }

    public RunAgentRequest withLlmModelId(Long resolvedLlmModelId) {
        return new RunAgentRequest(instruction, agentId, modelConfigId, resolvedLlmModelId, contextRefs);
    }
}
