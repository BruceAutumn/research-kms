package com.kms.agent;

import jakarta.persistence.*;
import java.io.Serializable;
import java.time.OffsetDateTime;
import java.util.Objects;

@Entity
@Table(name = "agent_tool")
@IdClass(AgentTool.Key.class)
public class AgentTool {
    @Id
    @Column(name = "agent_id")
    private Long agentId;
    @Id
    @Column(name = "tool_name", length = 128)
    private String toolName;
    private boolean enabled = true;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public AgentTool() {}
    public AgentTool(Long agentId, String toolName, boolean enabled) { this.agentId=agentId; this.toolName=toolName; this.enabled=enabled; }
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public String getToolName() { return toolName; }
    public void setToolName(String toolName) { this.toolName = toolName; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public OffsetDateTime getCreatedAt() { return createdAt; }

    public static class Key implements Serializable {
        private Long agentId;
        private String toolName;
        public Key() {}
        public Key(Long agentId, String toolName) { this.agentId=agentId; this.toolName=toolName; }
        @Override public boolean equals(Object o) { if (this == o) return true; if (!(o instanceof Key id)) return false; return Objects.equals(agentId, id.agentId) && Objects.equals(toolName, id.toolName); }
        @Override public int hashCode() { return Objects.hash(agentId, toolName); }
    }
}
