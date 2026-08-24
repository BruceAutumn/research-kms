package com.kms.ai;

/**
 * 长文分段策略：超长 PDF 全文不能粗暴截断前 N 字符。
 * 优先保留 Title/Abstract 开头 + Introduction / Methods / Experimental /
 * Results / Conclusion 章节段落，让模型看到论文骨架。
 */
public final class SectionExcerpt {
    private SectionExcerpt() {
    }

    private static final String[] HEADINGS = {
            "abstract", "introduction", "method", "methods", "experimental",
            "results", "discussion", "conclusion", "conclusions", "materials"
    };

    /** 把全文压缩到约 maxChars 字符的“章节感知”摘录。 */
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
            // 跳过已在开头片段里出现过的位置
            if (start < headBudget) continue;
            int sectionBudget = Math.min(1800, (maxChars - used) / 2);
            if (sectionBudget < 200) break;
            int end = Math.min(text.length(), start + sectionBudget);
            sb.append("\n\n--- 章节:" ).append(heading).append(" ---\n\n");
            sb.append(text, start, end);
            used += sectionBudget + 40;
            if (used >= maxChars) break;
        }

        // 兜底：如果几乎没拿到内容，再补一段结尾
        if (sb.length() < headBudget + 500 && text.length() > headBudget) {
            int tailStart = Math.max(headBudget, text.length() - 1500);
            sb.append("\n\n--- 结尾片段 ---\n\n").append(text, tailStart, text.length());
        }
        return sb.toString();
    }

    /** 在 text 中查找以 heading 开头（允许编号前缀）的行，返回行起始位置；找不到返回 -1。 */
    private static int findHeading(String text, String heading, String skipPrefix) {
        String lower = text.toLowerCase();
        String word = heading.toLowerCase();
        int from = 0;
        while (true) {
            int index = lower.indexOf(word, from);
            if (index < 0) return -1;
            // 前面是行首或仅含编号/空白
            int lineStart = text.lastIndexOf('\n', index - 1) + 1;
            String prefix = text.substring(lineStart, index);
            boolean lineStartOk = prefix.isBlank()
                    || prefix.matches("[\\s0-9.()\\-]+")
                    || prefix.matches("\\s*[ivxlcdmIVXLCDM]+[.)]?\\s*");
            // 后面是词边界
            int after = index + word.length();
            boolean wordBoundary = after >= text.length() || !Character.isLetterOrDigit(text.charAt(after));
            if (lineStartOk && wordBoundary && index >= skipPrefix.length()) {
                return lineStart;
            }
            from = index + word.length();
        }
    }
}
