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
 * Markdown frontmatter(YAML Block)parseandorderColumnconvert. 
 *
 * parseFailednotThrow Exception: Back {@code ParsedFrontmatter(valid=false)} and keep raw text, 
 * by UI Show yellow warning. type infer: checkbox(boolean) / number / list /
 * link("[[...]]" string) / date(YYYY-MM-DD) / text. 
 */
@Service
public class FrontmatterService {

    /** frontmatter Block: File Start ```---\n...\n---``` */
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
        // notOutput YAML document mark "---" Line(frontmatter We write the separator)
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
            // parseFailed: valid=false, Keep raw text and body
            return new ParsedFrontmatter(false, new LinkedHashMap<>(), raw, body);
        }
    }

    /** orderColumnconvert frontmatter Block(not containSeparatesymbol), Map Keep insertion order.  */
    public String serialize(Map<String, Object> data) {
        if (data == null || data.isEmpty()) {
            return "";
        }
        return yaml.dump(data).trim();
    }

    /** assemble fullFilecontent: frontmatter + Body.  */
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

    /** Infer property value type(properties Panel / note_properties.value_type use).  */
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

    /** list typePropertyorderColumnturn into YAML Semantic(provide Properties Panel uses).  */
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

    /**  PanelEditresultBy value_type back to correct Java type.  */
    public Object coerce(String valueType, Object value) {
        try {
            return switch (valueType == null ? "text" : valueType) {
                case "checkbox" -> Boolean.parseBoolean(String.valueOf(value));
                case "number" -> Double.parseDouble(String.valueOf(value));
                case "list" -> value instanceof List<?> list ? list : List.of(String.valueOf(value));
                default -> value;
            };
        } catch (NumberFormatException ex) {
            return value; // Save as text on number parse failure, Avoid data loss
        }
    }
}
