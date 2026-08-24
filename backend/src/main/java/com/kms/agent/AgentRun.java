package com.kms.agent;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "agent_run")
public class AgentRun {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "agent_id") private Long agentId;
    @Column(nullable = false, length = 32) private String status;
    @Column(columnDefinition = "text") private String input;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "context_refs", columnDefinition = "jsonb")
    private List<Map<String,Object>> contextRefs = List.of();
    @Column(name = "model_config_id") private Long modelConfigId;
    @Column(name = "llm_model_id") private Long llmModelId;
    @Column(name = "started_at", insertable = false, updatable = false) private OffsetDateTime startedAt;
    @Column(name = "finished_at") private OffsetDateTime finishedAt;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "token_usage", columnDefinition = "jsonb")
    private Map<String,Object> tokenUsage = new LinkedHashMap<>();
    @Column(columnDefinition = "text") private String error;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getInput() { return input; }
    public void setInput(String input) { this.input = input; }
    public List<Map<String, Object>> getContextRefs() { return contextRefs == null ? List.of() : contextRefs; }
    public void setContextRefs(List<Map<String, Object>> contextRefs) { this.contextRefs = contextRefs == null ? List.of() : contextRefs; }
    public Long getModelConfigId() { return modelConfigId; }
    public void setModelConfigId(Long modelConfigId) { this.modelConfigId = modelConfigId; }
    public Long getLlmModelId() { return llmModelId; }
    public void setLlmModelId(Long llmModelId) { this.llmModelId = llmModelId; }
    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
    public OffsetDateTime getFinishedAt() { return finishedAt; }
    public void setFinishedAt(OffsetDateTime finishedAt) { this.finishedAt = finishedAt; }
    public Map<String, Object> getTokenUsage() { return tokenUsage == null ? new LinkedHashMap<>() : tokenUsage; }
    public void setTokenUsage(Map<String, Object> tokenUsage) { this.tokenUsage = tokenUsage == null ? new LinkedHashMap<>() : tokenUsage; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
}
