package com.kms.ai;

/**
 * Long text chunking strategy: too long PDF Full text must not be truncated at N char. 
 * optimizeFirstKeep Title/Abstract start + Introduction / Methods / Experimental /
 * Results / Conclusion chapterParagraph, Let model see paper skeleton. 
 */
public final class SectionExcerpt {
    private SectionExcerpt() {
    }

    private static final String[] HEADINGS = {
            "abstract", "introduction", "method", "methods", "experimental",
            "results", "discussion", "conclusion", "conclusions", "materials"
    };

    /**  Full Textcompress to about maxChars char"chapter aware"excerpt.  */
    public static String excerpt(String text, int maxChars) {
        if (text == null || text.isBlank()) return "";
        if (text.length() <= maxChars) return text;

        int headBudget = Math.min(2500, maxChars / 4);
        StringBuilder sb = new StringBuilder();
        sb.append(text, 0, headBudget);
        int used = headBudget;

        for (String heading : HEADINGS) {
            int start = findHeading(text, heading, sb.toString());
            if (start < 0) continue;
            // Skip positions in head segments
            if (start < headBudget) continue;
            int sectionBudget = Math.min(1800, (maxChars - used) / 2);
            if (sectionBudget < 200) break;
            int end = Math.min(text.length(), start + sectionBudget);
            sb.append("\n\n--- chapter:" ).append(heading).append(" ---\n\n");
            sb.append(text, start, end);
            used += sectionBudget + 40;
            if (used >= maxChars) break;
        }

        // fallback: If almost no content, append moreOneSegmentending
        if (sb.length() < headBudget + 500 && text.length() > headBudget) {
            int tailStart = Math.max(headBudget, text.length() - 1500);
            sb.append("\n\n--- Tail Segment ---\n\n").append(text, tailStart, text.length());
        }
        return sb.toString();
    }

    /** in text find in heading start(allow numbered prefix) Line, BackLinestart position; Not found returns -1.  */
    private static int findHeading(String text, String heading, String skipPrefix) {
        String lower = text.toLowerCase();
        String word = heading.toLowerCase();
        int from = 0;
        while (true) {
            int index = lower.indexOf(word, from);
            if (index < 0) return -1;
            // front isLinehead or numbered/Blank
            int lineStart = text.lastIndexOf('\n', index - 1) + 1;
            String prefix = text.substring(lineStart, index);
            boolean lineStartOk = prefix.isBlank()
                    || prefix.matches("[\\s0-9.()\\-]+")
                    || prefix.matches("\\s*[ivxlcdmIVXLCDM]+[.)]?\\s*");
            // after is word boundary
            int after = index + word.length();
            boolean wordBoundary = after >= text.length() || !Character.isLetterOrDigit(text.charAt(after));
            if (lineStartOk && wordBoundary && index >= skipPrefix.length()) {
                return lineStart;
            }
            from = index + word.length();
        }
    }
}
