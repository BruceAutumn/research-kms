package com.kms.llm.dto;

public record LlmProviderTestResult(boolean ok, Long latencyMs, Integer upstreamStatus, Integer modelCount, String error) {
    public static LlmProviderTestResult ok(long latencyMs, Integer upstreamStatus, Integer modelCount) {
        return new LlmProviderTestResult(true, latencyMs, upstreamStatus, modelCount, null);
    }
    public static LlmProviderTestResult fail(long latencyMs, Integer upstreamStatus, String error) {
        return new LlmProviderTestResult(false, latencyMs, upstreamStatus, null, error);
    }
}
