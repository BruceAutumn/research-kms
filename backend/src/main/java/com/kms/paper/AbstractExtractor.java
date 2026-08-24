package com.kms.paper;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 从 PDF 全文中启发式提取 abstract。
 * 纯函数、无 Spring 依赖，方便单测。
 */
public final class AbstractExtractor {

    private AbstractExtractor() {}

    private static final int MIN_LEN = 80;
    private static final int MAX_LEN = 8000;

    // 匹配 abstract 关键字行：Abstract / ABSTRACT / 摘要 / Summary，后跟可选的 : ： . 或空白
    private static final Pattern START_PATTERN = Pattern.compile(
        "(?:^|\\n)\\s*(?:Abstract|ABSTRACT|摘要|Summary)\\s*[:：.．]?\\s*",
        Pattern.CASE_INSENSITIVE
    );

    // 终止符：Keywords / Key words / 关键词 / Index Terms / 1. Introduction / I. INTRODUCTION
    // 或连续两个换行后跟数字编号标题
    private static final Pattern END_PATTERN = Pattern.compile(
        "(?:\\n\\s*(?:Keywords|Key\\s+words|关键词|Index\\s+Terms|1\\.\\s*Introduction|I\\.\\s*INTRODUCTION))" +
        "|(?:\\n\\s*\\n\\s*(?:1|I)\\.\\s+[A-Z])",
        Pattern.CASE_INSENSITIVE
    );

    public static String extract(String pdfText) {
        if (pdfText == null || pdfText.isBlank()) return null;

        Matcher startMatcher = START_PATTERN.matcher(pdfText);
        if (!startMatcher.find()) return null;

        int start = startMatcher.end();
        String remainder = pdfText.substring(start);

        Matcher endMatcher = END_PATTERN.matcher(remainder);
        int end = endMatcher.find() ? endMatcher.start() : remainder.length();

        String raw = remainder.substring(0, end).trim();
        if (raw.isEmpty()) return null;

        String cleaned = clean(raw);
        if (cleaned.length() < MIN_LEN || cleaned.length() > MAX_LEN) return null;

        return cleaned;
    }

    private static String clean(String raw) {
        // 合并断行连字符：micro-\ncontrollers → microcontrollers
        String result = raw.replaceAll("-\\n", "");
        // 单换行替换为空格
        result = result.replace('\n', ' ');
        // 压缩连续空白
        result = result.replaceAll("\\s+", " ");
        return result.trim();
    }
}