package com.kms.agent;

import jakarta.persistence.*;
import java.time.OffsetDateTime;

@Entity
@Table(name = "workflow")
public class Workflow {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name="user_id", nullable=false) private Long userId;
    @Column(nullable=false, length=128) private String name;
    @Column(columnDefinition="text") private String description;
    @Column(name="created_at", insertable=false, updatable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at", insertable=false, updatable=false) private OffsetDateTime updatedAt;
    public Long getId(){return id;} public void setId(Long id){this.id=id;}
    public Long getUserId(){return userId;} public void setUserId(Long userId){this.userId=userId;}
    public String getName(){return name;} public void setName(String name){this.name=name;}
    public String getDescription(){return description;} public void setDescription(String description){this.description=description;}
    public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;}
}
