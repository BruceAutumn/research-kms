package com.kms.agent;

import com.kms.agent.dto.PluginDto;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/plugins")
public class PluginController {
    private final ToolRegistry toolRegistry;

    public PluginController(ToolRegistry toolRegistry) {
        this.toolRegistry = toolRegistry;
    }

    @GetMapping
    public List<PluginDto> list() {
        return toolRegistry.descriptors().stream()
                .map(tool -> new PluginDto(tool.name(), tool.displayName(), tool.description(), true, true))
                .toList();
    }
}
