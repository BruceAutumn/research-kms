package com.kms.agent.dto;

import com.fasterxml.jackson.databind.JsonNode;

public record ToolDto(
        String name,
        String displayName,
        String category,
        String description,
        JsonNode parameterSchema,
        boolean writeOperation,
        String permissionKey
) {
}
