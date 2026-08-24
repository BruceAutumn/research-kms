package com.kms.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * P1-3 Global Search -- Cross-type Content Search(Paper + Note + Annotation). 
 *
 * Userin CommandPalette (CmdK) On text input, Realtime search three resources: 
 * - Paper: title / authors / abstract(ILIKE Fuzzy Match)
 * - Note: title / content(ILIKE Fuzzy Match)
 * - Annotation: selected_text / comment(ILIKE Fuzzy Match)
 *
 * each typeBack top-N, Frontend groups in command palette, Click to jump. 
 */
@Service
public class GlobalSearchService {
    private static final int PER_TYPE_LIMIT = 5;

    private final JdbcTemplate jdbcTemplate;

    public GlobalSearchService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, Object> globalSearch(String query) {
        long userId = com.kms.common.CurrentUser.ID;
        String pattern = "%" + query.toLowerCase() + "%";

        List<Map<String, Object>> papers = searchPapers(userId, pattern);
        List<Map<String, Object>> notes = searchNotes(userId, pattern);
        List<Map<String, Object>> annotations = searchAnnotations(userId, pattern);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("query", query);
        result.put("papers", papers);
        result.put("notes", notes);
        result.put("annotations", annotations);
        result.put("totalCount", papers.size() + notes.size() + annotations.size());
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

    private List<Map<String, Object>> searchNotes(long userId, String pattern) {
        String sql = """
                SELECT id, title, path, paper_id
                FROM notes
                WHERE user_id = ?
                  AND (LOWER(title) LIKE ? OR LOWER(content) LIKE ?)
                ORDER BY (CASE WHEN LOWER(title) LIKE ? THEN 3 ELSE 0 END +
                         CASE WHEN LOWER(content) LIKE ? THEN 1 ELSE 0 END) DESC, updated_at DESC
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", rs.getLong("id"));
            row.put("title", rs.getString("title"));
            row.put("path", rs.getString("path"));
            row.put("paperId", rs.getObject("paper_id"));
            row.put("type", "note");
            return row;
        }, userId, pattern, pattern, pattern, pattern, PER_TYPE_LIMIT);
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
                    ? selectedText.substring(0, 80) + "..."
                    : selectedText);
            row.put("type", "annotation");
            return row;
        }, userId, pattern, pattern, PER_TYPE_LIMIT);
    }
}