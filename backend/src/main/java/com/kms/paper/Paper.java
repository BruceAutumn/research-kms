package com.kms.paper;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;

@Entity
@Table(name = "papers")
public class Paper {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 512)
    private String title;

    @Column(length = 1024)
    private String authors;

    @Column(length = 256)
    private String journal;

    private Integer year;

    @Column(length = 128)
    private String doi;

    @Column(length = 64)
    private String volume;

    @Column(length = 64)
    private String pages;

    @Column(length = 512)
    private String url;

    /** AI Extraction State Machine: NOT_PROCESSED / QUEUED / READING / EXTRACTING / REVIEW_REQUIRED / COMPLETED / FAILED */
    @Column(name = "ai_status", nullable = false, length = 32)
    private String aiStatus = "NOT_PROCESSED";

    @Column(nullable = false)
    private boolean favorite = false;

    @Column(nullable = false)
    private boolean trashed = false;

    @Column(name = "abstract", columnDefinition = "text")
    private String abstractText;

    @JdbcTypeCode(SqlTypes.ARRAY)
    @Column(columnDefinition = "text[]", nullable = false)
    private String[] tags = new String[0];

    /** Reading State: unread / reading / done(Zotero triage).  */
    @Column(name = "read_status", nullable = false, length = 16)
    private String readStatus = "unread";

    /** Process Status: PROCESSING / READY / ERROR / DUPLICATE(Product Plan 4.6 section).  */
    @Column(name = "process_status", nullable = false, length = 16)
    private String processStatus = "READY";

    /** 0-5 star, 0 Means unrated.  */
    @Column(name = "rating", nullable = false)
    private short rating = 0;

    @Column(name = "pdf_path", length = 512)
    private String pdfPath;

    @Column(name = "pdf_text", columnDefinition = "text")
    private String pdfText;

    @Column(name = "created_at", insertable = false, updatable = false)
    private OffsetDateTime createdAt;

    @Column(name = "date_modified")
    private OffsetDateTime dateModified;

    @Column(name = "last_opened_at")
    private OffsetDateTime lastOpenedAt;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getUserId() { return userId; }
    public void setUserId(Long userId) { this.userId = userId; }
    public String getTitle() { return title; }
    public void setTitle(String title) { this.title = title; }
    public String getAuthors() { return authors; }
    public void setAuthors(String authors) { this.authors = authors; }
    public String getJournal() { return journal; }
    public void setJournal(String journal) { this.journal = journal; }
    public Integer getYear() { return year; }
    public void setYear(Integer year) { this.year = year; }
    public String getDoi() { return doi; }
    public void setDoi(String doi) { this.doi = doi; }
    public String getVolume() { return volume; }
    public void setVolume(String volume) { this.volume = volume; }
    public String getPages() { return pages; }
    public void setPages(String pages) { this.pages = pages; }
    public String getUrl() { return url; }
    public void setUrl(String url) { this.url = url; }
    public String getAiStatus() { return aiStatus; }
    public void setAiStatus(String aiStatus) { this.aiStatus = aiStatus; }
    public boolean isFavorite() { return favorite; }
    public void setFavorite(boolean favorite) { this.favorite = favorite; }
    public boolean isTrashed() { return trashed; }
    public void setTrashed(boolean trashed) { this.trashed = trashed; }
    public OffsetDateTime getDateModified() { return dateModified; }
    public void setDateModified(OffsetDateTime dateModified) { this.dateModified = dateModified; }
    public OffsetDateTime getLastOpenedAt() { return lastOpenedAt; }
    public void setLastOpenedAt(OffsetDateTime lastOpenedAt) { this.lastOpenedAt = lastOpenedAt; }
    public String getAbstractText() { return abstractText; }
    public void setAbstractText(String abstractText) { this.abstractText = abstractText; }
    public String[] getTags() { return tags; }
    public void setTags(String[] tags) { this.tags = tags == null ? new String[0] : tags; }
    public String getReadStatus() { return readStatus; }
    public void setReadStatus(String readStatus) { this.readStatus = readStatus; }
    public short getRating() { return rating; }
    public void setRating(short rating) { this.rating = rating; }
    public String getPdfPath() { return pdfPath; }
    public void setPdfPath(String pdfPath) { this.pdfPath = pdfPath; }
    public String getPdfText() { return pdfText; }
    public void setPdfText(String pdfText) { this.pdfText = pdfText; }
    public OffsetDateTime getCreatedAt() { return createdAt; }
    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }

    public String getProcessStatus() { return processStatus; }
    public void setProcessStatus(String processStatus) { this.processStatus = processStatus; }
}
