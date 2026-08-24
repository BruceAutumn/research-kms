package com.kms.vault;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * [[Wiki Link]] 解析 —— 后端双链的真相来源已从数据库标题匹配迁移为
 * 基于文件路径的解析。支持：
 *   [[目标]]  [[目标|别名]]  [[目标#标题]]
 */
@Component
public class WikiLinkParser {

    // 捕获：标题（含空格）、可选 # 锚点、可选 | 别名
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

    /** 去重的目标标题集合（legacy target_title 兼容字段）。 */
    public Set<String> parseTargetTitles(String content) {
        Set<String> titles = new LinkedHashSet<>();
        for (WikiLink link : parse(content)) {
            titles.add(link.targetTitle());
        }
        return titles;
    }

    /** 正文中出现的 #标签（# 后紧跟非空格字符才算标签，排除 Markdown 标题）。 */
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

    /** 笔记「名字」（无扩展名），用于 [[标题]] ↔ 文件路径映射。 */
    public static String noteNameOf(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }
}
