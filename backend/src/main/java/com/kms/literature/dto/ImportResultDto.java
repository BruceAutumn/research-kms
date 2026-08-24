package com.kms.literature.dto;

import com.kms.paper.dto.PaperDto;

import java.util.List;

/** Batch import result: Partial failure does not break, Log error per item.  */
public record ImportResultDto(List<PaperDto> created, List<ImportError> errors) {
    public record ImportError(int index, String message) {
    }
}
