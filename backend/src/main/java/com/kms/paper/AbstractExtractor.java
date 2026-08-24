package com.kms.paper;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * from PDF Heuristic extract in full text abstract. 
 * pure function, no Spring depend, for unit test. 
 */
public final class AbstractExtractor {

    private AbstractExtractor() {}

    private static final int MIN_LEN = 80;
    private static final int MAX_LEN = 8000;

    // Match abstract Keyword Line: Abstract / ABSTRACT / Abstract / Summary, followed byOptional  : :  . Or blank
    private static final Pattern START_PATTERN = Pattern.compile(
        "(?:^|\\n)\\s*(?:Abstract|ABSTRACT|Abstract|Summary)\\s*[:: ..]?\\s*",
        Pattern.CASE_INSENSITIVE
    );

    // terminator: Keywords / Key words / Keywords / Index Terms / 1. Introduction / I. INTRODUCTION
    // Or two newlines then numbered heading
    private static final Pattern END_PATTERN = Pattern.compile(
        "(?:\\n\\s*(?:Keywords|Key\\s+words|Keywords|Index\\s+Terms|1\\.\\s*Introduction|I\\.\\s*INTRODUCTION))" +
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
        // mergeandbreakLinehyphen: micro-\ncontrollers -> microcontrollers
        String result = raw.replaceAll("-\\n", "");
        // Single newline to space
        result = result.replace('\n', ' ');
        // Collapse whitespace
        result = result.replaceAll("\\s+", " ");
        return result.trim();
    }
}