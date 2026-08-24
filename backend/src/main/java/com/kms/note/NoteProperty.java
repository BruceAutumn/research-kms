package com.kms.note;

import jakarta.persistence.*;

/**
 * note_properties Index Row: frontmatter Parse result cache(Source of truth is .md   YAML Block). 
 * Can with reindex Full Rebuild. 
 */
@Entity
@Table(name = "note_properties", uniqueConstraints = @UniqueConstraint(columnNames = {"note_id", "key"}))
public class NoteProperty {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "note_id", nullable = false)
    private Long noteId;

    @Column(nullable = false, length = 128)
    private String key;

    @Column(columnDefinition = "text")
    private String value;

    @Column(name = "value_type", nullable = false, length = 32)
    private String valueType = "text";

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getNoteId() { return noteId; }
    public void setNoteId(Long noteId) { this.noteId = noteId; }
    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
    public String getValueType() { return valueType; }
    public void setValueType(String valueType) { this.valueType = valueType; }
}
