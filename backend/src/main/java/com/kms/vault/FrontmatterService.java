package com.kms.vault;

import org.springframework.stereotype.Service;
import org.yaml.snakeyaml.DumperOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.error.YAMLException;
import org.yaml.snakeyaml.representer.Representer;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Markdown frontmatter（YAML 块）解析与序列化。
 *
 * 解析失败不抛异常：返回 {@code ParsedFrontmatter(valid=false)} 并保留原始文本，
 * 由 UI 显示黄色警告。类型推断：checkbox(boolean) / number / list /
 * link("[[…]]" 字符串) / date(YYYY-MM-DD) / text。
 */
@Service
public class FrontmatterService {

    /** frontmatter 块：文件开头 ```---\n…\n---``` */
    private static final Pattern FRONTMATTER_PATTERN = Pattern.compile(
            "\\A---[ \\t]*\\r?\\n(.*?)\\r?\\n---[ \\t]*\\r?\\n?", Pattern.DOTALL);

    private static final Pattern DATE_PATTERN = Pattern.compile("\\d{4}-\\d{2}-\\d{2}");
    private static final Pattern WIKI_LINK_ONLY = Pattern.compile("\\[\\[[^\\]]+\\]\\]");

    private final Yaml yaml;

    public FrontmatterService() {
        DumperOptions options = new DumperOptions();
        options.setDefaultFlowStyle(DumperOptions.FlowStyle.BLOCK);
        options.setIndent(2);
        options.setIndicatorIndent(0);
        options.setWidth(120);
        Representer representer = new Representer(options);
        // 不输出 YAML 文档标记 "---" 行（frontmatter 分隔符由我们自己写）
        this.yaml = new Yaml(representer, options);
    }

    public record ParsedFrontmatter(boolean valid, Map<String, Object> data, String raw, String body) {
        public ParsedFrontmatter {
            data = data == null ? new LinkedHashMap<>() : data;
            body = body == null ? "" : body;
        }
    }

    public ParsedFrontmatter parse(String content) {
        String text = content == null ? "" : content;
        Matcher matcher = FRONTMATTER_PATTERN.matcher(text);
        if (!matcher.find()) {
            return new ParsedFrontmatter(true, new LinkedHashMap<>(), "", text);
        }
        String raw = matcher.group(1);
        String body = text.substring(matcher.end());
        try {
            Object loaded = yaml.load(raw);
            Map<String, Object> data = new LinkedHashMap<>();
            if (loaded instanceof Map<?, ?> map) {
                map.forEach((key, value) -> data.put(String.valueOf(key), value));
            }
            return new ParsedFrontmatter(true, data, raw, body);
        } catch (YAMLException | ClassCastException ex) {
            // 解析失败：valid=false，保留原始文本与正文
            return new ParsedFrontmatter(false, new LinkedHashMap<>(), raw, body);
        }
    }

    /** 序列化 frontmatter 块（不含分隔符），Map 保持插入顺序。 */
    public String serialize(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return "";
        }
        return yaml.dump(data).trim();
    }

    /** 组装完整文件内容：frontmatter + 正文。 */
    public String compose(Map<String, Object> properties, String body) {
        if (properties == null || properties.isEmpty()) {
            return body == null ? "" : body;
        }
        String fm = serialize(properties);
        String bodyText = body == null ? "" : body;
        if (bodyText.startsWith("\n")) {
            bodyText = bodyText.substring(1);
        }
        if (bodyText.isEmpty()) {
            return "---\n" + fm + "\n---\n";
        }
        return "---\n" + fm + "\n---\n\n" + bodyText;
    }

    /** 推断属性值类型（properties 面板 / note_properties.value_type 用）。 */
    public String typeOf(Object value) {
        if (value == null) return "text";
        if (value instanceof Boolean) return "checkbox";
        if (value instanceof Number) return "number";
        if (value instanceof List<?>) return "list";
        if (value instanceof Map<?, ?>) return "text";
        String s = String.valueOf(value);
        if (WIKI_LINK_ONLY.matcher(s.trim()).matches()) return "link";
        if (DATE_PATTERN.matcher(s.trim()).matches()) return "date";
        return "text";
    }

    /** list 型属性序列化为 YAML 语义（供 Properties 面板使用）。 */
    @SuppressWarnings("unchecked")
    public List<String> toListValue(Object value) {
        if (value instanceof List<?> list) {
            return list.stream().map(String::valueOf).toList();
        }
        if (value instanceof String s) {
            List<String> result = new ArrayList<>();
            result.add(s);
            return result;
        }
        return List.of();
    }

    /** 把面板编辑结果按 value_type 转回正确 Java 类型。 */
    public Object coerce(String valueType, Object value) {
        try {
            return switch (valueType == null ? "text" : valueType) {
                case "checkbox" -> Boolean.parseBoolean(String.valueOf(value));
                case "number" -> Double.parseDouble(String.valueOf(value));
                case "list" -> value instanceof List<?> list ? list : List.of(String.valueOf(value));
                default -> value;
            };
        } catch (NumberFormatException ex) {
            return value; // 数字解析失败时按文本保存，避免数据丢失
        }
    }
}
