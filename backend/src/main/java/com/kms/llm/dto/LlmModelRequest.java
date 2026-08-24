package com.kms.llm.dto;

public class LlmModelRequest {
    private Long providerId;
    private String modelId;
    private String displayName;
    private Integer contextWindow;
    private Boolean supportsTools;
    private Boolean supportsStream;
    private Boolean isDefault;
    private Boolean enabled;
    /** 'chat' | 'embedding'。 */
    private String capability;

    public Long getProviderId() { return providerId; }
    public void setProviderId(Long providerId) { this.providerId = providerId; }
    public String getModelId() { return modelId; }
    public void setModelId(String modelId) { this.modelId = modelId; }
    public String getDisplayName() { return displayName; }
    public void setDisplayName(String displayName) { this.displayName = displayName; }
    public Integer getContextWindow() { return contextWindow; }
    public void setContextWindow(Integer contextWindow) { this.contextWindow = contextWindow; }
    public Boolean getSupportsTools() { return supportsTools; }
    public void setSupportsTools(Boolean supportsTools) { this.supportsTools = supportsTools; }
    public Boolean getSupportsStream() { return supportsStream; }
    public void setSupportsStream(Boolean supportsStream) { this.supportsStream = supportsStream; }
    public Boolean getIsDefault() { return isDefault; }
    public void setIsDefault(Boolean isDefault) { this.isDefault = isDefault; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
    public String getCapability() { return capability; }
    public void setCapability(String capability) { this.capability = capability; }
}
