package com.kms.agent;

import com.kms.agent.dto.ToolDto;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Component
public class ToolRegistry {
    private final Map<String, Tool> tools = new LinkedHashMap<>();

    public ToolRegistry(List<Tool> toolBeans) {
        for (Tool tool : toolBeans.stream().sorted((a, b) -> a.name().compareToIgnoreCase(b.name())).toList()) {
            Tool previous = tools.put(tool.name(), tool);
            if (previous != null) {
                throw new IllegalStateException("Duplicate tool name: " + tool.name());
            }
        }
    }

    public Tool get(String name) {
        return tools.get(name);
    }

    public Map<String, Tool> all() {
        return Map.copyOf(tools);
    }

    public List<ToolDto> descriptors() {
        return tools.values().stream().map(this::toDto).toList();
    }

    public ToolDto toDto(Tool tool) {
        return new ToolDto(tool.name(), tool.displayName(), tool.category(), tool.description(),
                tool.parameterSchema(), tool.isWriteOperation(), tool.permissionKey().name());
    }

    public String describeForPrompt() {
        return describeForPrompt(tools.keySet());
    }

    public String describeForPrompt(Collection<String> allowedNames) {
        Set<String> allowed = allowedNames == null ? tools.keySet() : allowedNames.stream().collect(Collectors.toSet());
        StringBuilder sb = new StringBuilder();
        for (Tool tool : tools.values()) {
            if (!allowed.contains(tool.name())) continue;
            sb.append("- ").append(tool.name())
                    .append(" (").append(tool.displayName()).append(")")
                    .append(tool.isWriteOperation() ? " [WRITE]" : "")
                    .append(": ").append(tool.description()).append('\n');
        }
        return sb.toString();
    }
}
