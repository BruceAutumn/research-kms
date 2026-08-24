package com.kms.agent;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "agent_prompt_version")
public class AgentPromptVersion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "agent_id", nullable = false)
    private Long agentId;
    @Column(nullable = false)
    private Integer version;
    @Column(columnDefinition = "text")
    private String prompt;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public Integer getVersion() { return version; }
    public void setVersion(Integer version) { this.version = version; }
    public String getPrompt() { return prompt; }
    public void setPrompt(String prompt) { this.prompt = prompt; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
