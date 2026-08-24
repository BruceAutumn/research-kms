package com.kms.literature;

import com.fasterxml.jackson.databind.JsonNode;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.dto.ImportResultDto;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import com.kms.paper.PaperService;
import com.kms.paper.dto.PaperDto;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class LiteratureImportService {
    private final RestClient.Builder restClientBuilder;
    private final PaperRepository paperRepository;
    private final PaperService paperService;

    public LiteratureImportService(RestClient.Builder restClientBuilder,
                                   PaperRepository paperRepository,
                                   PaperService paperService) {
        this.restClientBuilder = restClientBuilder;
        this.paperRepository = paperRepository;
        this.paperService = paperService;
    }

    /** DOI 导入：调 Crossref API（不调用 LLM）。 */
    @Transactional
    public PaperDto importDoi(String doi) {
        if (doi == null || doi.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "DOI is required.");
        }
        JsonNode message;
        try {
            JsonNode response = restClientBuilder.build()
                    .get()
                    .uri("https://api.crossref.org/works/{doi}", doi.trim())
                    .header("User-Agent", "ResearchKMS/1.0 (mailto:research-kms@example.com)")
                    .retrieve()
                    .body(JsonNode.class);
            message = response == null ? null : response.path("message");
        } catch (RestClientException ex) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "Crossref lookup failed: " + ex.getMessage());
        }
        if (message == null || message.isMissingNode()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "DOI not found in Crossref.");
        }

        Paper paper = new Paper();
        paper.setUserId(CurrentUser.ID);
        paper.setTitle(firstText(message.path("title"), stripLatex(doi.trim())));
        paper.setAuthors(joinAuthors(message.path("author")));
        paper.setJournal(firstText(message.path("container-title"), null));
        paper.setYear(firstInt(message.path("issued").path("date-parts"), null));
        paper.setDoi(doi.trim());
        paper.setVolume(firstText(message.path("volume"), null));
        paper.setPages(firstText(message.path("page"), null));
        paper.setUrl(firstText(message.path("URL"), null));
        String abstractXml = firstText(message.path("abstract"), null);
        if (abstractXml != null) {
            paper.setAbstractText(stripXmlTags(abstractXml));
        }
        paper.setTags(new String[0]);
        paper.setAiStatus("NOT_PROCESSED");

        // 重复检测：按 DOI 查重
        Paper existingByDoi = paperRepository.findByUserIdAndDoiAndTrashedFalse(CurrentUser.ID, doi.trim()).orElse(null);
        if (existingByDoi != null) {
            throw new ApiException(HttpStatus.CONFLICT,
                "DOI 已存在：「" + existingByDoi.getTitle() + "」（ID=" + existingByDoi.getId() + "）");
        }

        return paperService.toDto(paperRepository.save(paper));
    }

    /** BibTeX 批量导入：逐条解析，单条失败跳过并记录，不整批回滚。 */
    @Transactional
    public ImportResultDto importBibtex(String text) {
        if (text == null || text.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "BibTeX text is required.");
        }
        List<PaperDto> created = new ArrayList<>();
        List<ImportResultDto.ImportError> errors = new ArrayList<>();
        List<Map<String, String>> entries = parseEntries(text);
        if (entries.isEmpty()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "No BibTeX entries found.");
        }
        for (int index = 0; index < entries.size(); index++) {
            Map<String, String> entry = entries.get(index);
            try {
                created.add(createFromBibEntry(entry, index));
            } catch (Exception ex) {
                errors.add(new ImportResultDto.ImportError(index, ex.getMessage() == null ? ex.getClass().getSimpleName() : ex.getMessage()));
            }
        }
        return new ImportResultDto(created, errors);
    }

    private PaperDto createFromBibEntry(Map<String, String> entry, int index) {
        String title = entry.getOrDefault("title", "");
        if (title.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Entry missing title.");
        }
        Paper paper = new Paper();
        paper.setUserId(CurrentUser.ID);
        paper.setTitle(title);
        paper.setAuthors(emptyToNull(entry.get("author")));
        paper.setJournal(emptyToNull(entry.getOrDefault("journal", entry.get("booktitle"))));
        paper.setYear(parseIntOrNull(entry.get("year")));
        paper.setDoi(emptyToNull(entry.get("doi")));
        paper.setVolume(emptyToNull(entry.get("volume")));
        paper.setPages(emptyToNull(entry.get("pages")));
        paper.setUrl(emptyToNull(entry.get("url")));
        paper.setAbstractText(emptyToNull(entry.get("abstract")));
        paper.setTags(new String[0]);
        paper.setAiStatus("NOT_PROCESSED");
        return paperService.toDto(paperRepository.save(paper));
    }

    // ---------------------------------------------------------------- Crossref 字段解析

    private String firstText(JsonNode node, String fallback) {
        if (node == null || node.isMissingNode() || node.isNull()) return fallback;
        if (node.isArray()) {
            for (JsonNode item : node) {
                if (!item.isNull() && !item.asText().isBlank()) return stripLatex(item.asText());
            }
            return fallback;
        }
        String text = node.asText();
        return text.isBlank() ? fallback : stripLatex(text);
    }

    private String joinAuthors(JsonNode authors) {
        if (authors == null || !authors.isArray()) return null;
        List<String> names = new ArrayList<>();
        for (JsonNode author : authors) {
            String family = author.path("family").asText("");
            String given = author.path("given").asText("");
            String name = (given + " " + family).trim();
            if (!name.isBlank()) names.add(name);
        }
        return names.isEmpty() ? null : String.join("; ", names);
    }

    private Integer firstInt(JsonNode node, Integer fallback) {
        if (node == null || node.isMissingNode()) return fallback;
        if (node.isArray()) {
            for (JsonNode item : node) {
                Integer value = firstInt(item, null);
                if (value != null) return value;
            }
            return fallback;
        }
        if (node.isInt()) return node.asInt();
        if (node.isTextual()) {
            try {
                return Integer.valueOf(node.asText().replaceAll("[^0-9]", ""));
            } catch (NumberFormatException ex) {
                return fallback;
            }
        }
        return fallback;
    }

    // ---------------------------------------------------------------- BibTeX 解析（自研轻量解析器，不引第三方库）

    public static List<Map<String, String>> parseEntries(String text) {
        List<Map<String, String>> entries = new ArrayList<>();
        int index = 0;
        int n = text.length();
        while (index < n) {
            int at = text.indexOf('@', index);
            if (at < 0) break;
            int open = text.indexOf('{', at);
            if (open < 0 || open > at + 32) { index = at + 1; continue; }
            int depth = 0;
            int close = -1;
            for (int j = open; j < n; j++) {
                char c = text.charAt(j);
                if (c == '{') depth++;
                else if (c == '}') {
                    depth--;
                    if (depth == 0) { close = j; break; }
                }
            }
            if (close < 0) break;
            Map<String, String> entry = parseEntryBody(text.substring(open + 1, close));
            if (!entry.isEmpty()) entries.add(entry);
            index = close + 1;
        }
        return entries;
    }

    private static Map<String, String> parseEntryBody(String body) {
        int firstComma = body.indexOf(',');
        if (firstComma < 0) return Map.of();
        Map<String, String> map = new LinkedHashMap<>();
        for (String field : splitTopLevel(body.substring(firstComma + 1), ',')) {
            int eq = field.indexOf('=');
            if (eq < 0) continue;
            String key = field.substring(0, eq).trim().toLowerCase();
            String value = field.substring(eq + 1).trim();
            if (value.startsWith("{") && value.endsWith("}")) {
                value = value.substring(1, value.length() - 1);
            } else if (value.startsWith("\"") && value.endsWith("\"")) {
                value = value.substring(1, value.length() - 1);
            }
            map.put(key, stripLatex(value));
        }
        return map;
    }

    private static List<String> splitTopLevel(String input, char delimiter) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        StringBuilder current = new StringBuilder();
        for (char c : input.toCharArray()) {
            if (c == '{') depth++;
            else if (c == '}') depth--;
            if (c == delimiter && depth == 0) {
                parts.add(current.toString());
                current.setLength(0);
            } else {
                current.append(c);
            }
        }
        if (!current.isEmpty()) parts.add(current.toString());
        return parts;
    }

    private static String stripLatex(String value) {
        if (value == null) return null;
        return value
                .replaceAll("[{}]", "")
                .replace("\\&", "&")
                .replace("\\%", "%")
                .replace("\\_", "_")
                .replace("\\#", "#")
                .replace("~", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }

    private static String stripXmlTags(String xml) {
        if (xml == null) return null;
        return xml.replaceAll("<[^>]+>", " ").replaceAll("\\s+", " ").trim();
    }

    private static String emptyToNull(String value) {
        return value == null || value.isBlank() ? null : value;
    }

    private static Integer parseIntOrNull(String value) {
        if (value == null) return null;
        Matcher matcher = Pattern.compile("\\d{4}").matcher(value);
        if (matcher.find()) {
            try {
                return Integer.valueOf(matcher.group());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }
}
