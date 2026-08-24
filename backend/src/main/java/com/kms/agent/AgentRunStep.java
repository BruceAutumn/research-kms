package com.kms.agent;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "agent_run_step")
public class AgentRunStep {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "agent_run_id", nullable = false) private Long agentRunId;
    @Column(name = "step_order", nullable = false) private Integer stepOrder = 0;
    @Column(name = "tool_name", length = 128) private String toolName;
    @Column(name = "event_type", nullable = false, length = 64) private String eventType;
    @Column(nullable = false, length = 32) private String status;
    @Column(columnDefinition = "text") private String message;
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String,Object> input = new LinkedHashMap<>();
    @JdbcTypeCode(SqlTypes.JSON) @Column(columnDefinition = "jsonb") private Map<String,Object> output = new LinkedHashMap<>();
    @Column(columnDefinition = "text") private String error;
    @Column(name = "duration_ms") private Long durationMs;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "token_usage", columnDefinition = "jsonb") private Map<String,Object> tokenUsage = new LinkedHashMap<>();
    @Column(name = "created_at", insertable = false, updatable = false) private OffsetDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAgentRunId() { return agentRunId; }
    public void setAgentRunId(Long agentRunId) { this.agentRunId = agentRunId; }
    public Integer getStepOrder() { return stepOrder; }
    public void setStepOrder(Integer stepOrder) { this.stepOrder = stepOrder; }
    public String getToolName() { return toolName; }
    public void setToolName(String toolName) { this.toolName = toolName; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getMessage() { return message; }
    public void setMessage(String message) { this.message = message; }
    public Map<String, Object> getInput() { return input == null ? new LinkedHashMap<>() : input; }
    public void setInput(Map<String, Object> input) { this.input = input == null ? new LinkedHashMap<>() : input; }
    public Map<String, Object> getOutput() { return output == null ? new LinkedHashMap<>() : output; }
    public void setOutput(Map<String, Object> output) { this.output = output == null ? new LinkedHashMap<>() : output; }
    public String getError() { return error; }
    public void setError(String error) { this.error = error; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
    public Map<String, Object> getTokenUsage() { return tokenUsage == null ? new LinkedHashMap<>() : tokenUsage; }
    public void setTokenUsage(Map<String, Object> tokenUsage) { this.tokenUsage = tokenUsage == null ? new LinkedHashMap<>() : tokenUsage; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
