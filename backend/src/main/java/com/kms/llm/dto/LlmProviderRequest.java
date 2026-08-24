package com.kms.llm.dto;

import java.util.Map;

public class LlmProviderRequest {
    private String name;
    private String kind;
    private String baseUrl;
    private String apiKey;
    private Map<String, Object> extraHeaders;
    private String notes;
    private Boolean enabled;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getKind() { return kind; }
    public void setKind(String kind) { this.kind = kind; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public Map<String, Object> getExtraHeaders() { return extraHeaders; }
    public void setExtraHeaders(Map<String, Object> extraHeaders) { this.extraHeaders = extraHeaders; }
    public String getNotes() { return notes; }
    public void setNotes(String notes) { this.notes = notes; }
    public Boolean getEnabled() { return enabled; }
    public void setEnabled(Boolean enabled) { this.enabled = enabled; }
}
