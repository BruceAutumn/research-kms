package com.kms.note.dto;

public record CreatePaperNoteRequest(
    String content,
    String folder,
    String filename,
    String conflictStrategy
) {}