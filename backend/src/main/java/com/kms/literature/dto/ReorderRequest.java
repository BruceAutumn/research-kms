package com.kms.literature.dto;

import java.util.List;

/** 拖拽排序 / 换父级：前端把受影响节点的新位置整体提交。 */
public record ReorderRequest(List<ReorderItem> items) {
    public record ReorderItem(Long id, Long parentId, int sortOrder) {
    }
}
