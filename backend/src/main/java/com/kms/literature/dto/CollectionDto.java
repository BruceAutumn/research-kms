package com.kms.literature.dto;

import java.time.OffsetDateTime;

public record CollectionDto(
        Long id,
        Long parentId,
        String name,
        int sortOrder,
        long paperCount,
        OffsetDateTime createdAt
) {
}
