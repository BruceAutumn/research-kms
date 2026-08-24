package com.kms.citation;

import com.kms.paper.Paper;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;

/**
 * Citation and Reference Generation. 
 *
 * this was before fullyEmptyLack Oneenv: Zotero  Corevalue ofOneis"Readcan directlyReference", 
 * But this project does not even BibTeX no export -- After reading still hand-copy references. 
 *
 * pure function, No External Deps, thereforeAlllogic all unit tested. 
 * Name parse handles western(Huanjie Wu -> Wu, H.)and CJK names(Zhang San -> Zhang San, No Abbreviation). 
 */
@Service
public class CitationService {

    public enum Style { APA, IEEE, GBT7714, BIBTEX }

    /** Parsed single author. Western has given/family division, CJK Name as whole family.  */
    public record Author(String given, String family, boolean cjk) {
        /** Western Abbreviation: Huanjie -> H. ; multiple given Take initials. CJK No Abbreviation.  */
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
     *   authors Split field into author list. 
     * Compat common separators: comma, Semicolon, " and ", "&", Chinese comma. 
     */
    public List<Author> parseAuthors(String authors) {
        if (authors == null || authors.isBlank()) return List.of();
        String normalized = authors
                .replaceAll("(?i)\\s+and\\s+", ",")
                .replace(';', ',')
                .replace('&', ',')
                .replace(', ', ',');
        List<Author> out = new ArrayList<>();
        for (String raw : normalized.split(",")) {
            String name = raw.trim();
            if (name.isEmpty()) continue;
            boolean isCjk = CJK.matcher(name).find();
            if (isCjk) {
                out.add(new Author("", name, true));
                continue;
            }
            // already "Family, Given" Form no longer split
            if (name.contains(".") && name.indexOf('.') < name.lastIndexOf(' ')) {
                // Form like "H. Wu"
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
    // APA 7: Wu, H., Chen, C., & Weng, K. (2021). Title. Journal, 11(5), 2581. https://doi.org/...
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
    // IEEE: H. Wu, C. Chen, and K. Weng, "Title," Journal, vol. 11, pp. 2581, 2021.
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
    // GB/T 7714-2015: Author1, Author2, Author3. Title[J]. Journal Name, 2021, 11: 2581.
    // ------------------------------------------------------------------
    private String gbt7714(Paper paper) {
        List<Author> authors = parseAuthors(paper.getAuthors());
        StringBuilder sb = new StringBuilder();
        if (!authors.isEmpty()) {
            // GB/T 7714 Western author uses"Surname First Initial"and noPoint, Chinese author uses full name
            List<String> names = authors.stream()
                    .map(a -> a.cjk() ? a.family() : (a.family() + " " + a.initials().replace(".", "")).trim())
                    .toList();
            // List first three for over three + etc
            if (names.size() > 3) {
                sb.append(String.join(", ", names.subList(0, 3))).append(", etc");
            } else {
                sb.append(String.join(", ", names));
            }
            sb.append(". ");
        }
        sb.append(stripTrailingDot(safe(paper.getTitle(), "No Title"))).append("[J]. ");
        if (notBlank(paper.getJournal())) sb.append(paper.getJournal()).append(", ");
        sb.append(paper.getYear() == null ? "Publication year unknown" : paper.getYear());
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
            // BibTeX   and Separate; Western written Family, Given to avoid misjudgeNameorder
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
     * BibTeX cite key: First Author Surname + Year + Title first content word, All Lowercase. 
     * E.g. Wu / 2021 / "An Energy-Efficient Strategy" -> wu2021energy
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

    /** DOI May be stored as whole URL, unifiedOnestrip to raw DOI.  */
    private String cleanDoi(String doi) {
        return doi.trim()
                .replaceFirst("(?i)^https?://(dx\\.)?doi\\.org/", "")
                .replaceFirst("(?i)^doi:\\s*", "");
    }
}
