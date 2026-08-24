package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.Tool;

public abstract class AbstractJsonTool implements Tool {
    protected final ObjectMapper objectMapper;

    protected AbstractJsonTool(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "object");
        root.set("properties", objectMapper.createObjectNode());
        return root;
    }

    protected ObjectNode schema() {
        ObjectNode root = objectMapper.createObjectNode();
        root.put("type", "object");
        root.set("properties", objectMapper.createObjectNode());
        return root;
    }

    protected ObjectNode prop(ObjectNode schema, String name, String type, String description) {
        ObjectNode props = (ObjectNode) schema.withObject("/properties");
        ObjectNode node = props.putObject(name);
        node.put("type", type);
        node.put("description", description);
        return node;
    }

    protected void required(ObjectNode schema, String... names) {
        var arr = schema.putArray("required");
        for (String name : names) arr.add(name);
    }

    protected String str(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() ? "" : node.asText("");
    }

    protected String strArg(JsonNode args, String name) {
        return str(args == null ? null : args.get(name));
    }

    protected long longArg(JsonNode args, String name) {
        JsonNode node = args == null ? null : args.get(name);
        if (node == null || node.isMissingNode() || node.isNull()) return 0L;
        if (node.isNumber()) return node.asLong();
        try {
            return Long.parseLong(node.asText());
        } catch (NumberFormatException ex) {
            return 0L;
        }
    }

    protected int intArg(JsonNode args, String name, int fallback) {
        JsonNode node = args == null ? null : args.get(name);
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isNumber()) return node.asInt();
        try {
            return Integer.parseInt(node.asText());
        } catch (NumberFormatException ex) {
            return fallback;
        }
    }

    @Override
    public boolean isWriteOperation() { return false; }

    @Override
    public PermissionKey permissionKey() { return PermissionKey.READ_LITERATURE; }
}
