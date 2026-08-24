package com.kms.literature;

import jakarta.persistence.*;

import java.time.OffsetDateTime;

@Entity
@Table(name = "ai_extraction")
public class AiExtraction {
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_ACCEPTED = "ACCEPTED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_EDITED = "EDITED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(nullable = false, length = 128)
    private String field;

    @Column(name = "field_group", nullable = false, length = 32)
    private String fieldGroup;

    @Column(name = "original_value", columnDefinition = "text")
    private String originalValue;

    @Column(name = "extracted_value", columnDefinition = "text")
    private String extractedValue;

    /** 0–1，来自模型真实输出；模型没给则为 null，前端显示 —。 */
    private Double confidence;

    @Column(nullable = false, length = 16)
    private String status = STATUS_PENDING;

    @Column(name = "user_value", columnDefinition = "text")
    private String userValue;

    @Column(name = "model_used", length = 128)
    private String modelUsed;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getPaperId() { return paperId; }
    public void setPaperId(Long paperId) { this.paperId = paperId; }
    public String getField() { return field; }
    public void setField(String field) { this.field = field; }
    public String getFieldGroup() { return fieldGroup; }
    public void setFieldGroup(String fieldGroup) { this.fieldGroup = fieldGroup; }
    public String getOriginalValue() { return originalValue; }
    public void setOriginalValue(String originalValue) { this.originalValue = originalValue; }
    public String getExtractedValue() { return extractedValue; }
    public void setExtractedValue(String extractedValue) { this.extractedValue = extractedValue; }
    public Double getConfidence() { return confidence; }
    public void setConfidence(Double confidence) { this.confidence = confidence; }
    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }
    public String getUserValue() { return userValue; }
    public void setUserValue(String userValue) { this.userValue = userValue; }
    public String getModelUsed() { return modelUsed; }
    public void setModelUsed(String modelUsed) { this.modelUsed = modelUsed; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
