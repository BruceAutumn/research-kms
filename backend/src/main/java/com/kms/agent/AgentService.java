package com.kms.agent;

import com.kms.agent.dto.AgentDto;
import com.kms.agent.dto.AgentPromptVersionDto;
import com.kms.agent.dto.AgentRequest;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Objects;

@Service
public class AgentService {
    private final AgentRepository repository;
    private final AgentToolRepository toolRepository;
    private final AgentPromptVersionRepository promptVersionRepository;

    public AgentService(AgentRepository repository, AgentToolRepository toolRepository,
                        AgentPromptVersionRepository promptVersionRepository) {
        this.repository = repository;
        this.toolRepository = toolRepository;
        this.promptVersionRepository = promptVersionRepository;
    }

    public List<AgentDto> list() {
        return repository.findByUserIdOrderByCreatedAtDesc(CurrentUser.ID).stream().map(this::toDto).toList();
    }

    @Transactional
    public AgentDto create(AgentRequest request) {
        Agent agent = new Agent();
        agent.setUserId(CurrentUser.ID);
        apply(agent, request);
        Agent saved = repository.save(agent);
        syncTools(saved.getId(), request.getTools());
        savePromptVersion(saved.getId(), saved.getPrompt());
        return toDto(saved);
    }

    @Transactional
    public AgentDto update(Long id, AgentRequest request) {
        Agent agent = find(id);
        String oldPrompt = agent.getPrompt();
        apply(agent, request);
        Agent saved = repository.save(agent);
        syncTools(saved.getId(), request.getTools());
        if (!Objects.equals(oldPrompt, saved.getPrompt())) {
            savePromptVersion(saved.getId(), saved.getPrompt());
        }
        return toDto(saved);
    }

    @Transactional
    public AgentDto duplicate(Long id) {
        Agent source = find(id);
        Agent copy = new Agent();
        copy.setUserId(CurrentUser.ID);
        copy.setName(source.getName() + " 副本");
        copy.setModel(source.getModel());
        copy.setPrompt(source.getPrompt());
        copy.setModelConfigId(source.getModelConfigId());
        copy.setLlmModelId(source.getLlmModelId());
        copy.setKnowledgeScope(source.getKnowledgeScope());
        copy.setMemoryConfig(source.getMemoryConfig());
        copy.setOutputConfig(source.getOutputConfig());
        copy.setPermissions(source.getPermissions());
        copy.setWorkflowId(source.getWorkflowId());
        copy.setAdvanced(source.getAdvanced());
        copy.setPinned(false);
        copy.setIcon(source.getIcon());
        copy.setDescription(source.getDescription());
        Agent saved = repository.save(copy);
        syncTools(saved.getId(), enabledToolNames(source.getId()).toArray(new String[0]));
        savePromptVersion(saved.getId(), saved.getPrompt());
        return toDto(saved);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(find(id));
    }

    public Agent find(Long id) {
        return repository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Agent not found."));
    }

    public List<String> enabledToolNames(Long agentId) {
        if (agentId == null) return List.of();
        return toolRepository.findByAgentIdAndEnabledTrueOrderByToolNameAsc(agentId).stream().map(AgentTool::getToolName).toList();
    }

    public List<AgentPromptVersionDto> promptVersions(Long agentId) {
        find(agentId);
        return promptVersionRepository.findByAgentIdOrderByVersionDesc(agentId).stream().map(this::toPromptDto).toList();
    }

    @Transactional
    public AgentDto rollbackPrompt(Long agentId, Integer version) {
        Agent agent = find(agentId);
        AgentPromptVersion pv = promptVersionRepository.findByAgentIdAndVersion(agentId, version)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Prompt version not found."));
        agent.setPrompt(pv.getPrompt());
        Agent saved = repository.save(agent);
        savePromptVersion(agentId, pv.getPrompt());
        return toDto(saved);
    }

    private void apply(Agent agent, AgentRequest request) {
        agent.setName(request.getName());
        agent.setModel(request.getModel());
        agent.setPrompt(request.getPrompt());
        agent.setTools(normalizeTools(request.getTools()).toArray(new String[0])); // legacy mirror only
        agent.setModelConfigId(request.getModelConfigId());
        agent.setLlmModelId(request.getLlmModelId());
        if (request.getKnowledgeScope() != null) agent.setKnowledgeScope(request.getKnowledgeScope());
        if (request.getMemoryConfig() != null) agent.setMemoryConfig(request.getMemoryConfig());
        if (request.getOutputConfig() != null) agent.setOutputConfig(request.getOutputConfig());
        if (request.getPermissions() != null) agent.setPermissions(request.getPermissions());
        agent.setWorkflowId(request.getWorkflowId());
        if (request.getAdvanced() != null) agent.setAdvanced(request.getAdvanced());
        if (request.getPinned() != null) agent.setPinned(request.getPinned());
        agent.setIcon(request.getIcon());
        agent.setDescription(request.getDescription());
    }

    private void syncTools(Long agentId, String[] tools) {
        toolRepository.deleteByAgentId(agentId);
        for (String name : normalizeTools(tools)) {
            toolRepository.save(new AgentTool(agentId, name, true));
        }
    }

    private LinkedHashSet<String> normalizeTools(String[] tools) {
        LinkedHashSet<String> names = new LinkedHashSet<>();
        if (tools == null) return names;
        Arrays.stream(tools)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(s -> !s.isBlank())
                .map(this::mapLegacyToolName)
                .forEach(names::add);
        return names;
    }

    private String mapLegacyToolName(String name) {
        return switch (name) {
            case "search_papers" -> "literature-search";
            case "read_paper" -> "pdf-reader";
            case "search_notes" -> "note-reader";
            case "extract_metadata" -> "metadata-extractor";
            case "create_note" -> "note-writer";
            case "add_tag" -> "paper-tagger";
            default -> name;
        };
    }

    private void savePromptVersion(Long agentId, String prompt) {
        AgentPromptVersion row = new AgentPromptVersion();
        row.setAgentId(agentId);
        row.setVersion(promptVersionRepository.maxVersion(agentId) + 1);
        row.setPrompt(prompt == null ? "" : prompt);
        promptVersionRepository.save(row);
    }

    private AgentDto toDto(Agent agent) {
        String[] enabledTools = enabledToolNames(agent.getId()).toArray(new String[0]);
        if (enabledTools.length == 0 && agent.getTools() != null && agent.getTools().length > 0) {
            enabledTools = normalizeTools(agent.getTools()).toArray(new String[0]);
        }
        return new AgentDto(
                agent.getId(), agent.getUserId(), agent.getName(), agent.getModel(), agent.getPrompt(), enabledTools,
                agent.getCreatedAt(), agent.getModelConfigId(), agent.getLlmModelId(), agent.getKnowledgeScope(), agent.getMemoryConfig(),
                agent.getOutputConfig(), agent.getPermissions(), agent.getWorkflowId(), agent.getAdvanced(),
                agent.isPinned(), agent.getIcon(), agent.getDescription()
        );
    }

    private AgentPromptVersionDto toPromptDto(AgentPromptVersion row) {
        return new AgentPromptVersionDto(row.getId(), row.getAgentId(), row.getVersion(), row.getPrompt(), row.getCreatedAt());
    }
}
