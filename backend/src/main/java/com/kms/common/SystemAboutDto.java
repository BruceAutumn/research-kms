package com.kms.common;

public record SystemAboutDto(
        String version,
        String backendHealth,
        String flywayVersion,
        boolean mockLlm
) {
}
