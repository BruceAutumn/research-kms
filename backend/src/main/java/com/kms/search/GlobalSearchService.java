package com.kms.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import com.kms.vault.VaultIndexService;

import java.util.*;

/**
 * P1-3 Global Search —— 跨类型内容搜索（论文 + 笔记 + 标注）。
 *
 * 用户在 CommandPalette (⌘K) 输入文字时，实时搜索三类资源：
 * - 论文：title / authors / abstract（ILIKE 模糊匹配）
 * - 笔记：title / content（ILIKE 模糊匹配）
 * - 标注：selected_text / comment（ILIKE 模糊匹配）
 *
 * 每类返回 top-N，前端在命令面板中分组展示，点击可跳转。
 */
@Service
public class GlobalSearchService {
    private static final int PER_TYPE_LIMIT = 5;

    private final JdbcTemplate jdbcTemplate;
    private final VaultIndexService vaultIndexService;

    public GlobalSearchService(JdbcTemplate jdbcTemplate, VaultIndexService vaultIndexService) {
        this.jdbcTemplate = jdbcTemplate;
        this.vaultIndexService = vaultIndexService;
    }

    public Map<String, Object> globalSearch(String query) {
        long userId = com.kms.common.CurrentUser.ID;
        String pattern = "%" + query.toLowerCase() + "%";

        List<Map<String, Object>> papers = searchPapers(userId, pattern);
        List<Map<String, Object>> notes = searchNotes(query);
        List<Map<String, Object>> annotations = searchAnnotations(userId, pattern);
        List<Map<String, Object>> conversations = searchConversations(userId, pattern);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("query", query);
        result.put("papers", papers);
        result.put("notes", notes);
        result.put("annotations", annotations);
        result.put("conversations", conversations);
        result.put("totalCount", papers.size() + notes.size() + annotations.size() + conversations.size());
        return result;
    }

    private List<Map<String, Object>> searchPapers(long userId, String pattern) {
        String sql = """
                SELECT id, title, authors, year
                FROM papers
                WHERE user_id = ? AND trashed = false
                  AND (LOWER(title) LIKE ? OR LOWER(authors) LIKE ? OR LOWER(COALESCE(abstract, '')) LIKE ?)
                ORDER BY (CASE WHEN LOWER(title) LIKE ? THEN 3 ELSE 0 END +
                         CASE WHEN LOWER(authors) LIKE ? THEN 1 ELSE 0 END +
                         CASE WHEN LOWER(COALESCE(abstract, '')) LIKE ? THEN 2 ELSE 0 END) DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", rs.getLong("id"));
            row.put("title", rs.getString("title"));
            row.put("authors", rs.getString("authors"));
            row.put("year", rs.getObject("year"));
            row.put("type", "paper");
            return row;
        }, userId, pattern, pattern, pattern, pattern, pattern, pattern, PER_TYPE_LIMIT);
    }

    private List<Map<String, Object>> searchNotes(String query) {
        return vaultIndexService.search(query).stream()
                .limit(PER_TYPE_LIMIT)
                .map(row -> {
                    Map<String, Object> mapped = new LinkedHashMap<>(row);
                    mapped.put("type", "note");
                    return mapped;
                })
                .toList();
    }

    private List<Map<String, Object>> searchAnnotations(long userId, String pattern) {
        String sql = """
                SELECT a.id, a.paper_id, a.page, a.color, a.selected_text, p.title AS paper_title
                FROM annotation a
                JOIN papers p ON p.id = a.paper_id
                WHERE a.user_id = ?
                  AND (LOWER(COALESCE(a.selected_text, '')) LIKE ? OR LOWER(COALESCE(a.comment, '')) LIKE ?)
                ORDER BY a.created_at DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", rs.getLong("id"));
            row.put("paperId", rs.getLong("paper_id"));
            row.put("paperTitle", rs.getString("paper_title"));
            row.put("page", rs.getInt("page"));
            row.put("color", rs.getString("color"));
            String selectedText = rs.getString("selected_text");
            row.put("snippet", selectedText != null && selectedText.length() > 80
                    ? selectedText.substring(0, 80) + "…"
                    : selectedText);
            row.put("type", "annotation");
            return row;
        }, userId, pattern, pattern, PER_TYPE_LIMIT);
    }

    private List<Map<String, Object>> searchConversations(long userId, String pattern) {
        String sql = """
                SELECT c.id, c.title, c.updated_at, COUNT(m.id) AS message_count,
                       MAX(CASE WHEN LOWER(COALESCE(m.content, '')) LIKE ? THEN LEFT(m.content, 160) ELSE NULL END) AS snippet,
                       (CASE WHEN LOWER(c.title) LIKE ? THEN 3 ELSE 0 END +
                        CASE WHEN BOOL_OR(LOWER(COALESCE(m.content, '')) LIKE ?) THEN 1 ELSE 0 END) AS rank_score
                FROM ai_conversation c
                LEFT JOIN ai_message m ON m.conversation_id = c.id
                WHERE c.user_id = ?
                  AND (LOWER(c.title) LIKE ?
                       OR EXISTS (
                           SELECT 1 FROM ai_message m2
                           WHERE m2.conversation_id = c.id
                             AND LOWER(COALESCE(m2.content, '')) LIKE ?
                       ))
                GROUP BY c.id, c.title, c.updated_at
                ORDER BY rank_score DESC, c.updated_at DESC, c.id DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", rs.getLong("id"));
            row.put("title", rs.getString("title"));
            row.put("updatedAt", rs.getObject("updated_at"));
            row.put("messageCount", rs.getLong("message_count"));
            row.put("snippet", rs.getString("snippet"));
            row.put("type", "conversation");
            return row;
        }, pattern, pattern, pattern, userId, pattern, pattern, PER_TYPE_LIMIT);
    }
}
