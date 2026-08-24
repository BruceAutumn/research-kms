package com.kms.note.dto;

import java.util.List;

public record NotePreviewResult(
    String renderedMarkdown,
    String suggestedPath,
    List<String> aiPlaceholders,
    List<String> warnings
) {}