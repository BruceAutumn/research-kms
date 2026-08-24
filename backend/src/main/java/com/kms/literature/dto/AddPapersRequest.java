package com.kms.literature.dto;

import java.util.List;

public record AddPapersRequest(List<Long> paperIds) {
}
