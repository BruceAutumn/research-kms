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
        /** 乐观锁版本号：保存时原样回传，不匹配会拿到 409。 */
        long version
) {
}
