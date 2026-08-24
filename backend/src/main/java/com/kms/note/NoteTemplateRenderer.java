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
 * Note Template Placeholder Renderer. pure function, no Spring depend. 
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

        // Extract first AI Placeholder
        Matcher aiMatcher = AI_PLACEHOLDER.matcher(templateBody);
        while (aiMatcher.find()) {
            aiPlaceholders.add(aiMatcher.group(1).trim());
        }

        String result = templateBody;

        // Replace simple placeholder
        result = result.replace("{{title}}", safeStr(paper.getTitle(), "UnnamedPaper"));
        result = result.replace("{{authors}}", safeStr(paper.getAuthors(), "Unknown Author"));
        result = result.replace("{{journal}}", safeStr(paper.getJournal(), ""));
        result = result.replace("{{year}}", paper.getYear() != null ? String.valueOf(paper.getYear()) : "");
        result = result.replace("{{doi}}", safeStr(paper.getDoi(), ""));
        result = result.replace("{{paperId}}", String.valueOf(paper.getId()));
        result = result.replace("{{abstract}}", safeStr(paper.getAbstractText(), "No Abstract(Can in Metadata Panel manual entry)"));
        result = result.replace("{{today}}", LocalDate.now().toString());
        result = result.replace("{{metadata_table}}", renderMetadataTable(metadata));
        result = result.replace("{{ai_extraction}}", renderAiExtraction(extractions));
        result = result.replace("{{annotations}}", renderAnnotations(annotations, paper.getId()));

        // Process AI Placeholder
        if (resolveAi) {
            // TODO: Call LLM fill AI Placeholder, go LlmClientFactory unifiedOnePath
            // currently use MOCK Text Placeholder
            Matcher m = AI_PLACEHOLDER.matcher(result);
            StringBuffer sb = new StringBuffer();
            while (m.find()) {
                String prompt = m.group(1).trim();
                String replacement = "[MOCK AI Output] For prompt"" + prompt + "" Mockresult";
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
        if (metadata == null || metadata.isEmpty()) return "No metadata";
        StringBuilder sb = new StringBuilder("| Field | value |\n|---|---|\n");
        for (PaperMetadata m : metadata) {
            sb.append("| ").append(m.getKey()).append(" | ").append(m.getValue() != null ? m.getValue() : "").append(" |\n");
        }
        return sb.toString().stripTrailing();
    }

    private static String renderAiExtraction(List<AiExtraction> extractions) {
        if (extractions == null || extractions.isEmpty()) return "No AI extraction record";
        return extractions.stream()
                .filter(e -> "ACCEPTED".equals(e.getStatus()))
                .map(e -> "- **" + e.getField() + "**: " + (e.getUserValue() != null ? e.getUserValue() : e.getExtractedValue()))
                .collect(Collectors.joining("\n"));
    }

    private static String renderAnnotations(List<AnnotationInfo> annotations, Long paperId) {
        if (annotations == null || annotations.isEmpty()) return "No Annotations";
        return annotations.stream()
                .sorted(java.util.Comparator.comparingInt(AnnotationInfo::page))
                .map(a -> "> " + a.selectedText() + "\n> -- p." + a.page() + " ^ann-" + a.id()
                        + " " + backLink(paperId, a.id())
                        + (a.comment() != null && !a.comment().isBlank() ? "\n\n" + a.comment() : ""))
                .collect(Collectors.joining("\n\n"));
    }

    /**
     * back-jumpLink. ^ann-N is Obsidian  Block ReferenceSyntax, only atNoteInternaljump, cannot jump back PDF --
     * Bidirectional jump"back"that side via thisLink: in-app parse as"open the paper and locate the annotation". 
     * bothandstore: ^ann-N Continue compat Obsidian, [[paper:..]] only this app parses. 
     */
    private static String backLink(Long paperId, Long annotationId) {
        return "[[paper:" + paperId + "#ann-" + annotationId + "]]";
    }

    public record RenderResult(String renderedMarkdown, List<String> aiPlaceholders, List<String> warnings) {}
    public record AnnotationInfo(Long id, int page, String selectedText, String comment) {}
}