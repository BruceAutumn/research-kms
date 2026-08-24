package com.kms.citation;

import com.kms.paper.Paper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * 引文与参考文献生成。
 *
 * 这是此前完全空缺的一环：Zotero 的核心价值之一就是「读完能直接引用」，
 * 而本项目连 BibTeX 导出都没有 —— 文献读完了还要手抄一遍参考文献。
 *
 * 纯函数、无外部依赖，因此全部逻辑都有单元测试覆盖。
 * 姓名解析同时处理西文（Huanjie Wu -> Wu, H.）与中日韩姓名（张三 -> 张三，不缩写）。
 */
@Service
public class CitationService {

    public enum Style { APA, IEEE, GBT7714, BIBTEX }

    /** 解析后的单个作者。西文有 given/family 之分，CJK 姓名整体作为 family。 */
    public record Author(String given, String family, boolean cjk) {
        /** 西文缩写：Huanjie -> H. ；多个 given 各取首字母。CJK 不缩写。 */
        String initials() {
            if (cjk || given == null || given.isBlank()) return "";
            StringBuilder sb = new StringBuilder();
            for (String part : given.trim().split("[\\s.-]+")) {
                if (part.isBlank()) continue;
                sb.append(Character.toUpperCase(part.charAt(0))).append('.');
            }
            return sb.toString();
        }
    }

    private static final java.util.regex.Pattern CJK = java.util.regex.Pattern.compile("[\\u4e00-\\u9fff\\u3040-\\u30ff\\uac00-\\ud7af]");

    /**
     * 把 authors 字段拆成作者列表。
     * 兼容常见分隔：逗号、分号、" and "、"&"、中文顿号。
     */
    public List<Author> parseAuthors(String authors) {
        if (authors == null || authors.isBlank()) return List.of();
        String normalized = authors
                .replaceAll("(?i)\\s+and\\s+", ",")
                .replace(';', ',')
                .replace('&', ',')
                .replace('、', ',');
        List<Author> out = new ArrayList<>();
        for (String raw : normalized.split(",")) {
            String name = raw.trim();
            if (name.isEmpty()) continue;
            boolean isCjk = CJK.matcher(name).find();
            if (isCjk) {
                out.add(new Author("", name, true));
                continue;
            }
            // 已是 "Family, Given" 形式的不再拆
            if (name.contains(".") && name.indexOf('.') < name.lastIndexOf(' ')) {
                // 形如 "H. Wu"
                int lastSpace = name.lastIndexOf(' ');
                out.add(new Author(name.substring(0, lastSpace).trim(), name.substring(lastSpace + 1).trim(), false));
                continue;
            }
            int lastSpace = name.lastIndexOf(' ');
            if (lastSpace < 0) {
                out.add(new Author("", name, false));
            } else {
                out.add(new Author(name.substring(0, lastSpace).trim(), name.substring(lastSpace + 1).trim(), false));
            }
        }
        return out;
    }

    public String format(Paper paper, Style style) {
        return switch (style) {
            case APA -> apa(paper);
            case IEEE -> ieee(paper);
            case GBT7714 -> gbt7714(paper);
            case BIBTEX -> bibtex(paper);
        };
    }

    // ------------------------------------------------------------------
    // APA 7：Wu, H., Chen, C., & Weng, K. (2021). Title. Journal, 11(5), 2581. https://doi.org/...
    // ------------------------------------------------------------------
    private String apa(Paper paper) {
        List<Author> authors = parseAuthors(paper.getAuthors());
        StringBuilder sb = new StringBuilder();
        if (!authors.isEmpty()) {
            List<String> names = authors.stream()
                    .map(a -> a.cjk() ? a.family() : (a.family() + (a.initials().isEmpty() ? "" : ", " + a.initials())))
                    .toList();
            if (names.size() == 1) {
                sb.append(names.get(0));
            } else {
                sb.append(String.join(", ", names.subList(0, names.size() - 1)))
                  .append(", & ").append(names.get(names.size() - 1));
            }
            sb.append(' ');
        }
        sb.append('(').append(paper.getYear() == null ? "n.d." : paper.getYear()).append("). ");
        sb.append(stripTrailingDot(safe(paper.getTitle(), "Untitled"))).append(". ");
        if (notBlank(paper.getJournal())) {
            sb.append(paper.getJournal());
            if (notBlank(paper.getVolume())) sb.append(", ").append(paper.getVolume());
            if (notBlank(paper.getPages())) sb.append(", ").append(paper.getPages());
            sb.append(". ");
        }
        if (notBlank(paper.getDoi())) sb.append("https://doi.org/").append(cleanDoi(paper.getDoi()));
        return sb.toString().trim();
    }

    // ------------------------------------------------------------------
    // IEEE：H. Wu, C. Chen, and K. Weng, "Title," Journal, vol. 11, pp. 2581, 2021.
    // ------------------------------------------------------------------
    private String ieee(Paper paper) {
        List<Author> authors = parseAuthors(paper.getAuthors());
        StringBuilder sb = new StringBuilder();
        if (!authors.isEmpty()) {
            List<String> names = authors.stream()
                    .map(a -> a.cjk() ? a.family() : (a.initials() + " " + a.family()).trim())
                    .toList();
            if (names.size() == 1) {
                sb.append(names.get(0));
            } else {
                sb.append(String.join(", ", names.subList(0, names.size() - 1)))
                  .append(", and ").append(names.get(names.size() - 1));
            }
            sb.append(", ");
        }
        sb.append('"').append(stripTrailingDot(safe(paper.getTitle(), "Untitled"))).append(",\" ");
        if (notBlank(paper.getJournal())) sb.append(paper.getJournal()).append(", ");
        if (notBlank(paper.getVolume())) sb.append("vol. ").append(paper.getVolume()).append(", ");
        if (notBlank(paper.getPages())) sb.append("pp. ").append(paper.getPages()).append(", ");
        sb.append(paper.getYear() == null ? "n.d." : paper.getYear()).append('.');
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // GB/T 7714-2015：作者1, 作者2, 作者3. 题名[J]. 刊名, 2021, 11: 2581.
    // ------------------------------------------------------------------
    private String gbt7714(Paper paper) {
        List<Author> authors = parseAuthors(paper.getAuthors());
        StringBuilder sb = new StringBuilder();
        if (!authors.isEmpty()) {
            // GB/T 7714 西文作者用「姓 名首字母」且不加点，中文作者用全名
            List<String> names = authors.stream()
                    .map(a -> a.cjk() ? a.family() : (a.family() + " " + a.initials().replace(".", "")).trim())
                    .toList();
            // 三名以上只列前三名 + 等
            if (names.size() > 3) {
                sb.append(String.join(", ", names.subList(0, 3))).append(", 等");
            } else {
                sb.append(String.join(", ", names));
            }
            sb.append(". ");
        }
        sb.append(stripTrailingDot(safe(paper.getTitle(), "无题"))).append("[J]. ");
        if (notBlank(paper.getJournal())) sb.append(paper.getJournal()).append(", ");
        sb.append(paper.getYear() == null ? "出版年不详" : paper.getYear());
        if (notBlank(paper.getVolume())) sb.append(", ").append(paper.getVolume());
        if (notBlank(paper.getPages())) sb.append(": ").append(paper.getPages());
        sb.append('.');
        if (notBlank(paper.getDoi())) sb.append(" DOI: ").append(cleanDoi(paper.getDoi())).append('.');
        return sb.toString();
    }

    // ------------------------------------------------------------------
    // BibTeX
    // ------------------------------------------------------------------
    private String bibtex(Paper paper) {
        StringBuilder sb = new StringBuilder();
        sb.append("@article{").append(citeKey(paper)).append(",\n");
        appendField(sb, "title", paper.getTitle());
        List<Author> authors = parseAuthors(paper.getAuthors());
        if (!authors.isEmpty()) {
            // BibTeX 的 and 分隔；西文写成 Family, Given 以免被误判姓名顺序
            String joined = authors.stream()
                    .map(a -> a.cjk() || a.given().isBlank() ? a.family() : a.family() + ", " + a.given())
                    .reduce((x, y) -> x + " and " + y).orElse("");
            appendField(sb, "author", joined);
        }
        appendField(sb, "journal", paper.getJournal());
        if (paper.getYear() != null) appendField(sb, "year", String.valueOf(paper.getYear()));
        appendField(sb, "volume", paper.getVolume());
        appendField(sb, "pages", paper.getPages());
        appendField(sb, "doi", notBlank(paper.getDoi()) ? cleanDoi(paper.getDoi()) : null);
        appendField(sb, "url", paper.getUrl());
        sb.append("}");
        return sb.toString();
    }

    /**
     * BibTeX cite key：第一作者姓 + 年份 + 标题首个实词，全小写。
     * 例如 Wu / 2021 / "An Energy-Efficient Strategy" -> wu2021energy
     */
    public String citeKey(Paper paper) {
        List<Author> authors = parseAuthors(paper.getAuthors());
        String family = authors.isEmpty() ? "anon" : authors.get(0).family();
        String surname = family.replaceAll("[^\\p{L}\\p{N}]", "").toLowerCase(Locale.ROOT);
        String year = paper.getYear() == null ? "nd" : String.valueOf(paper.getYear());
        String word = "";
        if (notBlank(paper.getTitle())) {
            for (String token : paper.getTitle().split("[^\\p{L}\\p{N}]+")) {
                String lower = token.toLowerCase(Locale.ROOT);
                if (lower.length() >= 4 && !STOP_WORDS.contains(lower)) {
                    word = lower;
                    break;
                }
            }
        }
        return surname + year + word;
    }

    private static final List<String> STOP_WORDS = Arrays.asList(
            "the", "a", "an", "and", "or", "for", "with", "from", "into", "using", "based", "towards", "toward", "this", "that");

    private void appendField(StringBuilder sb, String key, String value) {
        if (!notBlank(value)) return;
        sb.append("  ").append(key).append(" = {").append(value.replace("{", "").replace("}", "")).append("},\n");
    }

    private boolean notBlank(String value) {
        return value != null && !value.isBlank();
    }

    private String safe(String value, String fallback) {
        return notBlank(value) ? value.trim() : fallback;
    }

    private String stripTrailingDot(String value) {
        return value.endsWith(".") ? value.substring(0, value.length() - 1) : value;
    }

    /** DOI 可能被存成完整 URL，统一剥成裸 DOI。 */
    private String cleanDoi(String doi) {
        return doi.trim()
                .replaceFirst("(?i)^https?://(dx\\.)?doi\\.org/", "")
                .replaceFirst("(?i)^doi:\\s*", "");
    }
}
