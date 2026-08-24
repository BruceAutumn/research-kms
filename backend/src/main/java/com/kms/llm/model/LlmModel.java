package com.kms.llm.model;

import com.kms.llm.provider.LlmProvider;
import jakarta.persistence.*;

import java.time.OffsetDateTime;

@Entity
@Table(name = "llm_model")
public class LlmModel {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "provider_id", nullable = false, insertable = false, updatable = false)
    private LlmProvider provider;
    @Column(name = "provider_id", nullable = false)
    private Long providerId;
    @Column(name = "model_id", nullable = false, length = 128)
    private String modelId;
    @Column(name = "display_name", nullable = false, length = 128)
    private String displayName;
    @Column(name = "context_window")
    private Integer contextWindow;
    @Column(name = "supports_tools", nullable = false)
    private boolean supportsTools = true;
    @Column(name = "supports_stream", nullable = false)
    private boolean supportsStream = true;
    @Column(name = "is_default", nullable = false)
    private boolean defaultModel;
    private boolean enabled = true;
    /** 'chat' | 'embedding'。此前没有这个维度，EmbeddingService 只能抓默认聊天模型 -> /embeddings 404。 */
    @Column(name = "capability", nullable = false, length = 16)
    private String capability = "chat";
    @Column(name = "legacy_model_config_id")
    private Long legacyModelConfigId;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public LlmProvider getProvider() { return provider; }
    public void setProvider(LlmProvider provider) { this.provider = provider; }
    public Long getProviderId() { return providerId; }
    public void setProviderId(Long providerId) { this.providerId = providerId; }
    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public Integer getContextWindow() { return contextWindow; }
    public void setContextWindow(Integer contextWindow) { this.contextWindow = contextWindow; }
    public boolean isSupportsTools() { return supportsTools; }
    public void setSupportsTools(boolean supportsTools) { this.supportsTools = supportsTools; }
    public boolean isSupportsStream() { return supportsStream; }
    public void setSupportsStream(boolean supportsStream) { this.supportsStream = supportsStream; }
    public boolean isDefaultModel() { return defaultModel; }
    public void setDefaultModel(boolean defaultModel) { this.defaultModel = defaultModel; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getCapability() { return capability; }
    public void setCapability(String capability) { this.capability = capability; }
    public Long getLegacyModelConfigId() { return legacyModelConfigId; }
    public void setLegacyModelConfigId(Long legacyModelConfigId) { this.legacyModelConfigId = legacyModelConfigId; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
