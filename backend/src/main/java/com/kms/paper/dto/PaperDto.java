package com.kms.paper.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.OffsetDateTime;

public record PaperDto(
        Long id,
        Long userId,
        String title,
        String authors,
        String journal,
        Integer year,
        String doi,
        String volume,
        String pages,
        String url,
        @JsonProperty("abstract") String abstractText,
        String[] tags,
        String pdfPath,
        String aiStatus,
        boolean favorite,
        boolean trashed,
        String readStatus,
        short rating,
        String processStatus,
        OffsetDateTime createdAt,
        OffsetDateTime dateModified,
        OffsetDateTime lastOpenedAt
) {
}
