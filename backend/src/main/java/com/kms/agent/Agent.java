package com.kms.agent;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "agents")
public class Agent {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(length = 128)
    private String model;

    @Column(columnDefinition = "text")
    private String prompt;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] tools = new String[0];

    @Column(name = "model_config_id")
    private Long modelConfigId;

    @Column(name = "llm_model_id")
    private Long llmModelId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "knowledge_scope", columnDefinition = "jsonb")
    private Map<String, Object> knowledgeScope = new LinkedHashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "memory_config", columnDefinition = "jsonb")
    private Map<String, Object> memoryConfig = new LinkedHashMap<>(Map.of("enabled", false, "limit", 20));

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "output_config", columnDefinition = "jsonb")
    private Map<String, Object> outputConfig = new LinkedHashMap<>(Map.of("type", "text"));

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> permissions = defaultPermissions();

    @Column(name = "workflow_id")
    private Long workflowId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> advanced = new LinkedHashMap<>(Map.of("maxIterations", 12, "timeoutSeconds", 300, "retries", 0));

    private boolean pinned;
    @Column(length = 64)
    private String icon;
    @Column(columnDefinition = "text")
    private String description;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public static Map<String, Object> defaultPermissions() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("READ_LITERATURE", "Allow");
        map.put("READ_VAULT", "Allow");
        map.put("CREATE_NOTE", "Ask");
        map.put("MODIFY_NOTE", "Ask");
        map.put("DELETE_NOTE", "Deny");
        map.put("MODIFY_METADATA", "Ask");
        map.put("NETWORK", "Ask");
        return map;
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
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
    public Map<String, Object> getKnowledgeScope() { return knowledgeScope == null ? new LinkedHashMap<>() : knowledgeScope; }
    public void setKnowledgeScope(Map<String, Object> knowledgeScope) { this.knowledgeScope = knowledgeScope == null ? new LinkedHashMap<>() : knowledgeScope; }
    public Map<String, Object> getMemoryConfig() { return memoryConfig == null ? new LinkedHashMap<>() : memoryConfig; }
    public void setMemoryConfig(Map<String, Object> memoryConfig) { this.memoryConfig = memoryConfig == null ? new LinkedHashMap<>() : memoryConfig; }
    public Map<String, Object> getOutputConfig() { return outputConfig == null ? new LinkedHashMap<>() : outputConfig; }
    public void setOutputConfig(Map<String, Object> outputConfig) { this.outputConfig = outputConfig == null ? new LinkedHashMap<>() : outputConfig; }
    public Map<String, Object> getPermissions() { return permissions == null ? defaultPermissions() : permissions; }
    public void setPermissions(Map<String, Object> permissions) { this.permissions = permissions == null ? defaultPermissions() : permissions; }
    public Long getWorkflowId() { return workflowId; }
    public void setWorkflowId(Long workflowId) { this.workflowId = workflowId; }
    public Map<String, Object> getAdvanced() { return advanced == null ? new LinkedHashMap<>() : advanced; }
    public void setAdvanced(Map<String, Object> advanced) { this.advanced = advanced == null ? new LinkedHashMap<>() : advanced; }
    public boolean isPinned() { return pinned; }
    public void setPinned(boolean pinned) { this.pinned = pinned; }
    public String getIcon() { return icon; }
    public void setIcon(String icon) { this.icon = icon; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
