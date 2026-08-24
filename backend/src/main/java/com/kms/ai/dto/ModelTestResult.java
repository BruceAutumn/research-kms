package com.kms.ai.dto;

public record ModelTestResult(
        boolean success,
        String type,
        String message,
        String model,
        Long modelConfigId
) {
    public static ModelTestResult ok(Long id, String model, String message) {
        return new ModelTestResult(true, "success", message, model, id);
    }
    public static ModelTestResult fail(Long id, String model, String type, String message) {
        return new ModelTestResult(false, type, message, model, id);
    }
}
