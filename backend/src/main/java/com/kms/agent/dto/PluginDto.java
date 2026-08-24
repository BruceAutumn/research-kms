package com.kms.agent.dto;

public record PluginDto(
        String id,
        String name,
        String description,
        boolean enabled,
        boolean builtin
) {
}
