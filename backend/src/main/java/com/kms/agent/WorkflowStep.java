package com.kms.agent;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@Entity
@Table(name = "workflow_step")
public class WorkflowStep {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(name="workflow_id", nullable=false) private Long workflowId;
    @Column(name="step_order", nullable=false) private Integer stepOrder;
    @Column(name="tool_name", nullable=false, length=128) private String toolName;
    @Column(columnDefinition="text") private String prompt;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="input_mapping", columnDefinition="jsonb") private Map<String,Object> inputMapping = new LinkedHashMap<>();
    @Column(name="output_key", length=128) private String outputKey;
    @Column(columnDefinition="text") private String condition;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name="retry_policy", columnDefinition="jsonb") private Map<String,Object> retryPolicy = new LinkedHashMap<>();
    private boolean enabled = true;
    @Column(name="created_at", insertable=false, updatable=false) private OffsetDateTime createdAt;
    @Column(name="updated_at", insertable=false, updatable=false) private OffsetDateTime updatedAt;
    public Long getId(){return id;} public void setId(Long id){this.id=id;}
    public Long getWorkflowId(){return workflowId;} public void setWorkflowId(Long workflowId){this.workflowId=workflowId;}
    public Integer getStepOrder(){return stepOrder;} public void setStepOrder(Integer stepOrder){this.stepOrder=stepOrder;}
    public String getToolName(){return toolName;} public void setToolName(String toolName){this.toolName=toolName;}
    public String getPrompt(){return prompt;} public void setPrompt(String prompt){this.prompt=prompt;}
    public Map<String,Object> getInputMapping(){return inputMapping==null?new LinkedHashMap<>():inputMapping;} public void setInputMapping(Map<String,Object> inputMapping){this.inputMapping=inputMapping==null?new LinkedHashMap<>():inputMapping;}
    public String getOutputKey(){return outputKey;} public void setOutputKey(String outputKey){this.outputKey=outputKey;}
    public String getCondition(){return condition;} public void setCondition(String condition){this.condition=condition;}
    public Map<String,Object> getRetryPolicy(){return retryPolicy==null?new LinkedHashMap<>():retryPolicy;} public void setRetryPolicy(Map<String,Object> retryPolicy){this.retryPolicy=retryPolicy==null?new LinkedHashMap<>():retryPolicy;}
    public boolean isEnabled(){return enabled;} public void setEnabled(boolean enabled){this.enabled=enabled;}
    public OffsetDateTime getCreatedAt(){return createdAt;} public OffsetDateTime getUpdatedAt(){return updatedAt;}
}
