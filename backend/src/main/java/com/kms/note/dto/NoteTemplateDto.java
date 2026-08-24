package com.kms.note.dto;

import java.time.OffsetDateTime;

public record NoteTemplateDto(
    Long id,
    String name,
    String scope,
    String body,
    Boolean isDefault,
    Boolean isBuiltin,
    Integer sortOrder,
    OffsetDateTime createdAt,
    OffsetDateTime updatedAt
) {}