package com.kms.literature.dto;

public class AnnotationRequest {
    private Long paperId;
    private Integer page;
    private String position;
    private String selectedText;
    private String color;
    private String comment;
    private String type;
    private String rectsJson;

    public Long getPaperId() { return paperId; }
    public void setPaperId(Long paperId) { this.paperId = paperId; }
    public Integer getPage() { return page; }
    public void setPage(Integer page) { this.page = page; }
    public String getPosition() { return position; }
    public void setPosition(String position) { this.position = position; }
    public String getSelectedText() { return selectedText; }
    public void setSelectedText(String selectedText) { this.selectedText = selectedText; }
    public String getColor() { return color; }
    public void setColor(String color) { this.color = color; }
    public String getComment() { return comment; }
    public void setComment(String comment) { this.comment = comment; }
    public String getType() { return type; }
    public void setType(String type) { this.type = type; }
    public String getRectsJson() { return rectsJson; }
    public void setRectsJson(String rectsJson) { this.rectsJson = rectsJson; }
}
