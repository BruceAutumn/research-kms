package com.kms.agent.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

import java.util.List;
import java.util.Map;

/** initiateOnetime Agent Running Request. contextRefs Only pass references, Full text injected by backend via reference parsing.  */
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
