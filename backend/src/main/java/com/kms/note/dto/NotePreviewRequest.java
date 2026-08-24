package com.kms.note.dto;

public record NotePreviewRequest(
    Long templateId,
    Boolean resolveAi
) {}