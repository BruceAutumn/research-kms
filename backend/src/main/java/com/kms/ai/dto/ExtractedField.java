package com.kms.ai.dto;

/** 带置信度的提取字段：confidence 来自模型真实输出（0–1），模型没给则为 null。 */
public record ExtractedField(String key, String value, Double confidence, String group) {
}
