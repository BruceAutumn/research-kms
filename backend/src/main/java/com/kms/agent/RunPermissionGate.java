package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;

@FunctionalInterface
public interface RunPermissionGate {
    boolean beforeTool(Tool tool, JsonNode args, int affectedCount);
}
