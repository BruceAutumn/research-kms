package com.kms.paper.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public class PaperUpdateRequest {
    private String title;
    private String authors;
    private String journal;
    private Integer year;
    private String doi;
    private String volume;
    private String pages;
    private String url;
    @JsonProperty("abstract")
    private String abstractText;
    private String[] tags;
    private Boolean favorite;
    private Boolean trashed;

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
    public String getAbstractText() { return abstractText; }
    public void setAbstractText(String abstractText) { this.abstractText = abstractText; }
    public String[] getTags() { return tags; }
    public void setTags(String[] tags) { this.tags = tags; }
    public Boolean getFavorite() { return favorite; }
    public void setFavorite(Boolean favorite) { this.favorite = favorite; }
    public Boolean getTrashed() { return trashed; }
    public void setTrashed(Boolean trashed) { this.trashed = trashed; }
}
