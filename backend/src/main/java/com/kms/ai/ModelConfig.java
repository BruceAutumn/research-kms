package com.kms.ai;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "model_config")
public class ModelConfig {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 128)
    private String name;

    @Column(nullable = false, length = 64)
    private String provider;

    @Column(name = "base_url", length = 512)
    private String baseUrl;

    /** Temporary plaintext staging only. Startup migration encrypts and clears it. */
    @Column(name = "api_key", columnDefinition = "text")
    private String apiKey;

    @Column(name = "api_key_enc", columnDefinition = "text")
    private String apiKeyEnc;

    @Column(name = "model_name", nullable = false, length = 256)
    private String modelName;

    private Double temperature = 0.2;

    @Column(name = "max_tokens")
    private Integer maxTokens = 4096;

    @Column(name = "context_window")
    private Integer contextWindow = 128000;

    @Column(name = "embedding_model", length = 256)
    private String embeddingModel;

    @Column(name = "is_default", nullable = false)
    private boolean defaultModel;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getApiKeyEnc() { return apiKeyEnc; }
    public void setApiKeyEnc(String apiKeyEnc) { this.apiKeyEnc = apiKeyEnc; }
    public String getModelName() { return modelName; }
    public void setModelName(String modelName) { this.modelName = modelName; }
    public Double getTemperature() { return temperature; }
    public void setTemperature(Double temperature) { this.temperature = temperature; }
    public Integer getMaxTokens() { return maxTokens; }
    public void setMaxTokens(Integer maxTokens) { this.maxTokens = maxTokens; }
    public Integer getContextWindow() { return contextWindow; }
    public void setContextWindow(Integer contextWindow) { this.contextWindow = contextWindow; }
    public String getEmbeddingModel() { return embeddingModel; }
    public void setEmbeddingModel(String embeddingModel) { this.embeddingModel = embeddingModel; }
    public boolean isDefaultModel() { return defaultModel; }
    public void setDefaultModel(boolean defaultModel) { this.defaultModel = defaultModel; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
