package com.kms.agent.dto;

import java.util.Map;

/**
 * Onepush toFrontend "Action Timeline"Event(SSE). 
 *
 * @param type    thinking | step | done | error
 * @param message for humanOnesentence description
 * @param tool    thisEventassociatedTool Name(Can be null)
 * @param detail  extra resultAbstract(Can be null)
 * @param ts      ms timestamp
 */
public record AgentStepEvent(String type, String message, String tool, String detail, long ts,
                             Map<String, Object> input, Map<String, Object> output,
                             Map<String, Object> tokenUsage) {
    public AgentStepEvent(String type, String message, String tool, String detail, long ts) {
        this(type, message, tool, detail, ts, Map.of(), Map.of(), Map.of());
    }
}
