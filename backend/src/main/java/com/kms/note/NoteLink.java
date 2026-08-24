package com.kms.note;

import jakarta.persistence.*;

/**
 * note_links 索引行（Phase 4 起为 Vault 索引缓存，真相来源是文件内容）。
 * legacy 字段 target_title 保留（未解析链接与 legacy backlinks 查询用）。
 */
@Entity
@Table(name = "note_links", uniqueConstraints = @UniqueConstraint(columnNames = {"source_note_id", "target_title"}))
public class NoteLink {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "source_note_id", nullable = false)
    private Long sourceNoteId;

    @Column(name = "target_title", nullable = false, length = 512)
    private String targetTitle;

    @Column(name = "source_path", length = 1024)
    private String sourcePath;

    @Column(name = "target_path", length = 1024)
    private String targetPath;

    @Column(name = "target_raw", length = 512)
    private String targetRaw;

    @Column(length = 512)
    private String alias;

    @Column(nullable = false)
    private boolean resolved = false;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getSourceNoteId() { return sourceNoteId; }
    public void setSourceNoteId(Long sourceNoteId) { this.sourceNoteId = sourceNoteId; }
    public String getTargetTitle() { return targetTitle; }
    public void setTargetTitle(String targetTitle) { this.targetTitle = targetTitle; }
    public String getSourcePath() { return sourcePath; }
    public void setSourcePath(String sourcePath) { this.sourcePath = sourcePath; }
    public String getTargetPath() { return targetPath; }
    public void setTargetPath(String targetPath) { this.targetPath = targetPath; }
    public String getTargetRaw() { return targetRaw; }
    public void setTargetRaw(String targetRaw) { this.targetRaw = targetRaw; }
    public String getAlias() { return alias; }
    public void setAlias(String alias) { this.alias = alias; }
    public boolean isResolved() { return resolved; }
    public void setResolved(boolean resolved) { this.resolved = resolved; }
}
