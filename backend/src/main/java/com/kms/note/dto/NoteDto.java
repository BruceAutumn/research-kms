package com.kms.note.dto;

import java.time.OffsetDateTime;
import java.util.Map;

public record NoteDto(
        Long id,
        Long userId,
        String title,
        String content,
        Map<String, Object> properties,
        Long paperId,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt,
        /** optimistic lock version: Pass back as-is on save, notMatchwill get 409.  */
        long version
) {
}
