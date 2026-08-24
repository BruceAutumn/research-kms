package com.kms.agent.dto;

import java.util.Map;

/**
 * 一条推给前端的「动作时间线」事件(SSE)。
 *
 * @param type    thinking | step | done | error
 * @param message 给人看的一句话描述
 * @param tool    本条事件关联的工具名(可为 null)
 * @param detail  额外的结果摘要(可为 null)
 * @param ts      毫秒时间戳
 */
public record AgentStepEvent(String type, String message, String tool, String detail, long ts,
                             Map<String, Object> input, Map<String, Object> output,
                             Map<String, Object> tokenUsage) {
    public AgentStepEvent(String type, String message, String tool, String detail, long ts) {
        this(type, message, tool, detail, ts, Map.of(), Map.of(), Map.of());
    }
}
