package com.kms.literature;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Entity
@Table(name = "annotation")
public class Annotation {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(nullable = false)
    private int page;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private String position;

    @Column(name = "selected_text", columnDefinition = "text")
    private String selectedText;

    @Column(length = 16)
    private String color;

    @Column(columnDefinition = "text")
    private String comment;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at", insertable = false, updatable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "rects_json", columnDefinition = "text")
    private String rectsJson;

    @Column(name = "type", length = 24)
    private String type = "highlight";

    @Column(name = "sort_key")
    private Double sortKey;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public Long getPaperId() { return paperId; }
    public void setPaperId(Long paperId) { this.paperId = paperId; }
    public int getPage() { return page; }
    public void setPage(int page) { this.page = page; }
    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }
    public String getSelectedText() { return selectedText; }
    public void setSelectedText(String selectedText) { this.selectedText = selectedText; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
    public String getRectsJson() { return rectsJson; }
    public void setRectsJson(String rectsJson) { this.rectsJson = rectsJson; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public Double getSortKey() { return sortKey; }
    public void setSortKey(Double sortKey) { this.sortKey = sortKey; }
}
