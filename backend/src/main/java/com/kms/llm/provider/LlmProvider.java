package com.kms.llm.provider;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "llm_provider")
public class LlmProvider {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, length = 64, unique = true)
    private String name;
    @Column(nullable = false, length = 32)
    private String kind;
    @Column(name = "base_url", nullable = false, length = 512)
    private String baseUrl;
    @Column(name = "api_key_encrypted", columnDefinition = "text")
    private String apiKeyEncrypted;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "extra_headers", columnDefinition = "jsonb")
    private Map<String, Object> extraHeaders = new LinkedHashMap<>();
    @Column(columnDefinition = "text")
    private String notes;
    private boolean enabled = true;
    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKeyEncrypted() { return apiKeyEncrypted; }
    public void setApiKeyEncrypted(String apiKeyEncrypted) { this.apiKeyEncrypted = apiKeyEncrypted; }
    public Map<String, Object> getExtraHeaders() { return extraHeaders == null ? new LinkedHashMap<>() : extraHeaders; }
    public void setExtraHeaders(Map<String, Object> extraHeaders) { this.extraHeaders = extraHeaders == null ? new LinkedHashMap<>() : extraHeaders; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
