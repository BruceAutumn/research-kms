package com.kms.ai.dto;

/** Extraction fields with confidence: confidence From real model output(0-1), If model not given then null.  */
public record ExtractedField(String key, String value, Double confidence, String group) {
}
