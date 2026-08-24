package com.kms.vault;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * [[Wiki Link]] parse -- Backend backlink source of truth migrated from DB title match to
 * based onFilePathparse. support: 
 *   [[target]]  [[target|elseName]]  [[target#Title]]
 */
@Component
public class WikiLinkParser {

    // catch: Title(withEmptyformat), Optional # anchorPoint, Optional | elseName
    private static final Pattern WIKI_LINK_PATTERN = Pattern.compile(
            "\\[\\[([^\\]\\[#|]+)(?:#([^\\]\\[|]*))?(?:\\|([^\\]\\[|]*))?\\]\\]");

    public record WikiLink(String targetRaw, String target, String anchor, String alias) {
        public String targetTitle() {
            return target.trim();
        }
    }

    public List<WikiLink> parse(String content) {
        List<WikiLink> result = new ArrayList<>();
        if (content == null) {
            return result;
        }
        Matcher matcher = WIKI_LINK_PATTERN.matcher(content);
        while (matcher.find()) {
            String target = matcher.group(1).trim();
            if (target.isBlank()) {
                continue;
            }
            result.add(new WikiLink(
                    matcher.group(0).substring(2, matcher.group(0).length() - 2),
                    target,
                    matcher.group(2) == null ? null : matcher.group(2).trim(),
                    matcher.group(3) == null ? null : matcher.group(3).trim()));
        }
        return result;
    }

    /** Dedup target title set(legacy target_title Compat Field).  */
    public Set<String> parseTargetTitles(String content) {
        Set<String> titles = new LinkedHashSet<>();
        for (WikiLink link : parse(content)) {
            titles.add(link.targetTitle());
        }
        return titles;
    }

    /** Appears in body #Tag(# after followed by nonEmptychar counts asTag, Exclude Markdown Title).  */
    public static final Pattern TAG_PATTERN = Pattern.compile("(?<![\\w#])#([\\p{L}\\p{N}_\\-/]+)");

    public Set<String> parseTags(String content) {
        Set<String> tags = new LinkedHashSet<>();
        if (content == null) {
            return tags;
        }
        Matcher matcher = TAG_PATTERN.matcher(content);
        while (matcher.find()) {
            tags.add(matcher.group(1));
        }
        return tags;
    }

    /** Note"Name"(No Extension), used for [[Title]] <-> File Path Mapping.  */
    public static String noteNameOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }
}
