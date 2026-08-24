package com.kms.paper;

import jakarta.persistence.*;

@Entity
@Table(name = "paper_metadata", uniqueConstraints = @UniqueConstraint(columnNames = {"paper_id", "key"}))
public class PaperMetadata {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "key", nullable = false, length = 128)
    private String key;

    @Column(columnDefinition = "text")
    private String value;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getPaperId() { return paperId; }
    public void setPaperId(Long paperId) { this.paperId = paperId; }
    public String getKey() { return key; }
    public void setKey(String key) { this.key = key; }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}
