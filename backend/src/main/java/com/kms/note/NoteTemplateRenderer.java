package com.kms.note;

import com.kms.literature.AiExtraction;
import com.kms.paper.Paper;
import com.kms.paper.PaperMetadata;

import java.time.LocalDate;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 笔记模板占位符渲染器。纯函数，无 Spring 依赖。
 */
public final class NoteTemplateRenderer {

    private NoteTemplateRenderer() {}

    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([^}]+)\\}\\}");
    private static final Pattern AI_PLACEHOLDER = Pattern.compile("\\{\\{ai:(.+?)\\}\\}");

    public static RenderResult render(
            String templateBody,
            Paper paper,
            List<PaperMetadata> metadata,
            List<AiExtraction> extractions,
            List<AnnotationInfo> annotations,
            boolean resolveAi
    ) {
        List<String> warnings = new java.util.ArrayList<>();
        List<String> aiPlaceholders = new java.util.ArrayList<>();

        // 先提取 AI 占位符
        Matcher aiMatcher = AI_PLACEHOLDER.matcher(templateBody);
        while (aiMatcher.find()) {
            aiPlaceholders.add(aiMatcher.group(1).trim());
        }

        String result = templateBody;

        // 替换简单占位符
        result = result.replace("{{title}}", safeStr(paper.getTitle(), "未命名文献"));
        result = result.replace("{{authors}}", safeStr(paper.getAuthors(), "未知作者"));
        result = result.replace("{{journal}}", safeStr(paper.getJournal(), ""));
        result = result.replace("{{year}}", paper.getYear() != null ? String.valueOf(paper.getYear()) : "");
        result = result.replace("{{doi}}", safeStr(paper.getDoi(), ""));
        result = result.replace("{{paperId}}", String.valueOf(paper.getId()));
        result = result.replace("{{abstract}}", safeStr(paper.getAbstractText(), "暂无摘要（可在 Metadata 面板手动补录）"));
        result = result.replace("{{today}}", LocalDate.now().toString());
        result = result.replace("{{metadata_table}}", renderMetadataTable(metadata));
        result = result.replace("{{ai_extraction}}", renderAiExtraction(extractions));
        result = result.replace("{{annotations}}", renderAnnotations(annotations, paper.getId()));

        // 处理 AI 占位符
        if (resolveAi) {
            // TODO: 调用 LLM 填充 AI 占位符，走 LlmClientFactory 统一路径
            // 目前用 MOCK 文本占位
            Matcher m = AI_PLACEHOLDER.matcher(result);
            StringBuffer sb = new StringBuffer();
            while (m.find()) {
                String prompt = m.group(1).trim();
                String replacement = "[MOCK AI 输出] 针对提示词「" + prompt + "」的模拟结果";
                m.appendReplacement(sb, Matcher.quoteReplacement(replacement));
            }
            m.appendTail(sb);
            result = sb.toString();
        }

        return new RenderResult(result, aiPlaceholders, warnings);
    }

    private static String safeStr(String s, String fallback) {
        return (s == null || s.isBlank()) ? fallback : s;
    }

    private static String renderMetadataTable(List<PaperMetadata> metadata) {
        if (metadata == null || metadata.isEmpty()) return "暂无 metadata";
        StringBuilder sb = new StringBuilder("| 字段 | 值 |\n|---|---|\n");
        for (PaperMetadata m : metadata) {
            sb.append("| ").append(m.getKey()).append(" | ").append(m.getValue() != null ? m.getValue() : "").append(" |\n");
        }
        return sb.toString().stripTrailing();
    }

    private static String renderAiExtraction(List<AiExtraction> extractions) {
        if (extractions == null || extractions.isEmpty()) return "暂无 AI extraction 记录";
        return extractions.stream()
                .filter(e -> "ACCEPTED".equals(e.getStatus()))
                .map(e -> "- **" + e.getField() + "**: " + (e.getUserValue() != null ? e.getUserValue() : e.getExtractedValue()))
                .collect(Collectors.joining("\n"));
    }

    private static String renderAnnotations(List<AnnotationInfo> annotations, Long paperId) {
        if (annotations == null || annotations.isEmpty()) return "暂无标注";
        return annotations.stream()
                .sorted(java.util.Comparator.comparingInt(AnnotationInfo::page))
                .map(a -> "> " + a.selectedText() + "\n> — p." + a.page() + " ^ann-" + a.id()
                        + " " + backLink(paperId, a.id())
                        + (a.comment() != null && !a.comment().isBlank() ? "\n\n" + a.comment() : ""))
                .collect(Collectors.joining("\n\n"));
    }

    /**
     * 回跳链接。^ann-N 是 Obsidian 的块引用语法，只在笔记内部跳，跳不回 PDF ——
     * 双向跳转的「回」那半边靠这个链接：应用内解析为「打开该 paper 并定位到该标注」。
     * 两者并存：^ann-N 继续兼容 Obsidian，[[paper:..]] 只有本应用会解析。
     */
    private static String backLink(Long paperId, Long annotationId) {
        return "[[paper:" + paperId + "#ann-" + annotationId + "]]";
    }

    public record RenderResult(String renderedMarkdown, List<String> aiPlaceholders, List<String> warnings) {}
    public record AnnotationInfo(Long id, int page, String selectedText, String comment) {}
}