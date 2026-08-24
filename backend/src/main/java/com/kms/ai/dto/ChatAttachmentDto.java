package com.kms.ai.dto;

public record ChatAttachmentDto(
        String path,
        String name,
        Long size,
        String contentType
) {
}
