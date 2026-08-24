package com.kms.agent.dto;

import jakarta.validation.constraints.NotBlank;
import java.util.Map;

public class AgentRequest {
    @NotBlank
    private String name;
    private String model;
    private String prompt;
    private String[] tools = new String[0];
    private Long modelConfigId;
    private Long llmModelId;
    private Map<String, Object> knowledgeScope;
    private Map<String, Object> memoryConfig;
    private Map<String, Object> outputConfig;
    private Map<String, Object> permissions;
    private Long workflowId;
    private Map<String, Object> advanced;
    private Boolean pinned;
    private String icon;
    private String description;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
    public String[] getTools() { return tools; }
    public void setTools(String[] tools) { this.tools = tools == null ? new String[0] : tools; }
    public Long getModelConfigId() { return modelConfigId; }
    public void setModelConfigId(Long modelConfigId) { this.modelConfigId = modelConfigId; }
    public Long getLlmModelId() { return llmModelId; }
    public void setLlmModelId(Long llmModelId) { this.llmModelId = llmModelId; }
    public Map<String, Object> getKnowledgeScope() { return knowledgeScope; }
    public void setKnowledgeScope(Map<String, Object> knowledgeScope) { this.knowledgeScope = knowledgeScope; }
    public Map<String, Object> getMemoryConfig() { return memoryConfig; }
    public void setMemoryConfig(Map<String, Object> memoryConfig) { this.memoryConfig = memoryConfig; }
    public Map<String, Object> getOutputConfig() { return outputConfig; }
    public void setOutputConfig(Map<String, Object> outputConfig) { this.outputConfig = outputConfig; }
    public Map<String, Object> getPermissions() { return permissions; }
    public void setPermissions(Map<String, Object> permissions) { this.permissions = permissions; }
    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }
    public Map<String, Object> getAdvanced() { return advanced; }
    public void setAdvanced(Map<String, Object> advanced) { this.advanced = advanced; }
    public Boolean getPinned() { return pinned; }
    public void setPinned(Boolean pinned) { this.pinned = pinned; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
}
