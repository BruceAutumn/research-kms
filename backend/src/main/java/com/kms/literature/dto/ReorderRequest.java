package com.kms.literature.dto;

import java.util.List;

/** Drag Sort / Change Parent: Frontend submits affected node positions.  */
public record ReorderRequest(List<ReorderItem> items) {
    public record ReorderItem(Long id, Long parentId, int sortOrder) {
    }
}
