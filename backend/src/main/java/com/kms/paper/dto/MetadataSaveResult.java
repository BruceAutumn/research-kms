package com.kms.paper.dto;

import java.util.List;

public record MetadataSaveResult(
    List<MetadataDto> fields,
    int saved,
    int droppedEmptyKeys,
    List<String> overwrittenKeys
) {
}