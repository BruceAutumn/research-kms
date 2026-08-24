package com.kms.ai.dto;

public record SettingsDto(
        String provider,
        String baseUrl,
        String model,
        String apiKey
) {
}
