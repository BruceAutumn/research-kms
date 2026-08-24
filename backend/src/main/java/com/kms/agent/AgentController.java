package com.kms.agent;

import com.kms.agent.dto.AgentDto;
import com.kms.agent.dto.AgentPromptVersionDto;
import com.kms.agent.dto.AgentRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/agents")
public class AgentController {
    private final AgentService agentService;

    public AgentController(AgentService agentService) {
        this.agentService = agentService;
    }

    @GetMapping
    public List<AgentDto> list() {
        return agentService.list();
    }

    @PostMapping
    public AgentDto create(@Valid @RequestBody AgentRequest request) {
        return agentService.create(request);
    }

    @PatchMapping("/{id}")
    public AgentDto patch(@PathVariable Long id, @Valid @RequestBody AgentRequest request) {
        return agentService.update(id, request);
    }

    @PutMapping("/{id}")
    public AgentDto update(@PathVariable Long id, @Valid @RequestBody AgentRequest request) {
        return agentService.update(id, request);
    }

    @PostMapping("/{id}/duplicate")
    public AgentDto duplicate(@PathVariable Long id) {
        return agentService.duplicate(id);
    }

    @GetMapping("/{id}/prompt-versions")
    public List<AgentPromptVersionDto> promptVersions(@PathVariable Long id) {
        return agentService.promptVersions(id);
    }

    @PostMapping("/{id}/prompt-versions/{version}/rollback")
    public AgentDto rollbackPrompt(@PathVariable Long id, @PathVariable Integer version) {
        return agentService.rollbackPrompt(id, version);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        agentService.delete(id);
    }
}
