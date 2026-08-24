package com.kms.note;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "notes")
public class Note {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 512)
    private String title;

    @Column(nullable = false, columnDefinition = "text")
    private String content = "";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> properties = new LinkedHashMap<>();

    @Column(name = "paper_id")
    private Long paperId;

    // ---- Phase 4: Vault Index cache field(Source of truth is disk .md File)----
    @Column(length = 1024)
    private String path;

    private Long mtime;

    @Column(name = "content_hash", length = 64)
    private String contentHash;

    @Column(name = "indexed_at")
    private OffsetDateTime indexedAt;

    @Column(name = "search_vector", columnDefinition = "tsvector", insertable = false, updatable = false)
    private String searchVector;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
    /**
     * optimistic lock version. intentionally not use JPA @Version: notes is index table, VaultIndexService On scan
     * will rewrite theseLine, @Version will putIndexnormalWriteAlsojudge asConflict. thisinManualincrement. 
     */
    @Column(name = "version", nullable = false)
    private long version = 0L;

    @PrePersist
    public void prePersist() {
        if (updatedAt == null) {
            updatedAt = OffsetDateTime.now();
        }
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = OffsetDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content == null ? "" : content; }
    public Map<String, Object> getProperties() { return properties; }
    public void setProperties(Map<String, Object> properties) { this.properties = properties == null ? new LinkedHashMap<>() : properties; }
    public Long getPaperId() { return paperId; }
    public void setPaperId(Long paperId) { this.paperId = paperId; }
    public String getPath() { return path; }
    public void setPath(String path) { this.path = path; }
    public Long getMtime() { return mtime; }
    public void setMtime(Long mtime) { this.mtime = mtime; }
    public String getContentHash() { return contentHash; }
    public void setContentHash(String contentHash) { this.contentHash = contentHash; }
    public OffsetDateTime getIndexedAt() { return indexedAt; }
    public void setIndexedAt(OffsetDateTime indexedAt) { this.indexedAt = indexedAt; }
    public String getSearchVector() { return searchVector; }
    public void setSearchVector(String searchVector) { this.searchVector = searchVector; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
    public long getVersion() { return version; }
    public void setVersion(long version) { this.version = version; }
    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
