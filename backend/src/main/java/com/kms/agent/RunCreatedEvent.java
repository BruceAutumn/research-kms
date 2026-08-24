package com.kms.agent;

import com.kms.agent.dto.RunAgentRequest;

public record RunCreatedEvent(Long runId, RunAgentRequest request) {
}
