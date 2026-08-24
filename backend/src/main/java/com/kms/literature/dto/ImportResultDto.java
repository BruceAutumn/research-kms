package com.kms.literature.dto;

import com.kms.paper.dto.PaperDto;

import java.util.List;

/** 批量导入结果：部分失败不中断，逐条记录错误。 */
public record ImportResultDto(List<PaperDto> created, List<ImportError> errors) {
    public record ImportError(int index, String message) {
    }
}
