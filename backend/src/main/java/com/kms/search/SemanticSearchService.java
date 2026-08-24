package com.kms.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 段落级语义检索。
 *
 * 查 embedding_chunk 取 top-K chunk，再聚合回 paper / note 层：同一来源只保留最高分的那块，
 * 并把命中的 chunk 文本片段与页码一起返回 —— 研究工具要回答的是「哪一段讲了这个」，
 * 只给一个 paper id 和相似度百分比是不够的。
 *
 * 只比较同一 model 生成的向量：换模型后旧向量还在表里，混在一起算余弦距离没有意义。
 */
@Service
public class SemanticSearchService {
    /** 聚合前多取一些 chunk，否则同一篇论文的多个块会把 top-K 占满，来源数不够。 */
    private static final int CHUNK_OVERSAMPLE = 8;
    private static final int SNIPPET_CHARS = 300;

    private final JdbcTemplate jdbcTemplate;
    private final EmbeddingService embeddingService;

    public SemanticSearchService(JdbcTemplate jdbcTemplate, EmbeddingService embeddingService) {
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingService = embeddingService;
    }

    public List<Map<String, Object>> searchPapers(String query, int limit) {
        return search(query, limit, "paper");
    }

    public List<Map<String, Object>> searchNotes(String query, int limit) {
        return search(query, limit, "note");
    }

    public Map<String, Object> searchAll(String query, int limit) {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("papers", searchPapers(query, limit));
        result.put("notes", searchNotes(query, limit));
        return result;
    }

    /**
     * 在单篇论文内部按问题检索最相关的段落。
     *
     * Reader 里的 AI 对话原本喂的是 SectionExcerpt 的静态章节摘录（12000 字符封顶），
     * 一篇 73000 字符的论文有 83% 根本没进模型，且摘录内容与用户问了什么无关 ——
     * 这就是「感觉不满血」的直接原因。改成按问题取 top-K 段落后，
     * 模型看到的是和问题真正相关的原文，而不是固定的开头几章。
     *
     * @return 每项含 page / snippet / similarity，按相关度降序。
     */
    public List<Map<String, Object>> searchWithinPaper(String query, Long paperId, int topK) {
        if (query == null || query.isBlank() || paperId == null) return List.of();
        float[] embedding = embeddingService.embedQuery(query);
        String vectorStr = EmbeddingService.toVectorString(embedding);
        String model = embeddingService.currentModelId();
        String sql = """
                SELECT chunk_index, page, text,
                       1 - (embedding <=> ?::vector) AS similarity
                FROM embedding_chunk
                WHERE source_type = 'paper' AND source_id = ? AND model = ?
                ORDER BY embedding <=> ?::vector
                LIMIT ?
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("chunkIndex", rs.getInt("chunk_index"));
            row.put("page", rs.getObject("page"));
            row.put("text", rs.getString("text"));
            row.put("similarity", rs.getDouble("similarity"));
            return row;
        }, vectorStr, paperId, model, vectorStr, topK);
    }

    private List<Map<String, Object>> search(String query, int limit, String sourceType) {
        float[] embedding = embeddingService.embedQuery(query);
        String vectorStr = EmbeddingService.toVectorString(embedding);
        String model = embeddingService.currentModelId();

        String sql = sourceType.equals("paper") ? """
                SELECT c.source_id, c.chunk_index, c.page, c.text,
                       1 - (c.embedding <=> ?::vector) AS similarity,
                       p.title AS title, p.authors AS authors, p.year AS year, p.doi AS doi, NULL AS path
                FROM embedding_chunk c
                JOIN papers p ON p.id = c.source_id
                WHERE c.source_type = 'paper' AND c.model = ?
                ORDER BY c.embedding <=> ?::vector
                LIMIT ?
                """ : """
                SELECT c.source_id, c.chunk_index, c.page, c.text,
                       1 - (c.embedding <=> ?::vector) AS similarity,
                       n.title AS title, NULL AS authors, NULL AS year, NULL AS doi, n.path AS path
                FROM embedding_chunk c
                JOIN notes n ON n.id = c.source_id
                WHERE c.source_type = 'note' AND c.model = ?
                ORDER BY c.embedding <=> ?::vector
                LIMIT ?
                """;

        List<Map<String, Object>> hits = jdbcTemplate.query(sql, (rs, rowNum) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", rs.getLong("source_id"));
            row.put("title", rs.getString("title"));
            row.put("similarity", rs.getDouble("similarity"));
            row.put("chunkIndex", rs.getInt("chunk_index"));
            Object page = rs.getObject("page");
            row.put("page", page);
            row.put("snippet", snippet(rs.getString("text")));
            if (sourceType.equals("paper")) {
                row.put("authors", rs.getString("authors"));
                row.put("year", rs.getObject("year"));
                row.put("doi", rs.getString("doi"));
            } else {
                row.put("path", rs.getString("path"));
            }
            return row;
        }, vectorStr, model, vectorStr, limit * CHUNK_OVERSAMPLE);

        // 聚合回来源层：同一 paper/note 只留分数最高的那块（查询已按距离排序，首次出现即最高）。
        Map<Long, Map<String, Object>> best = new LinkedHashMap<>();
        for (Map<String, Object> hit : hits) {
            best.putIfAbsent((Long) hit.get("id"), hit);
            if (best.size() >= limit) break;
        }
        return new ArrayList<>(best.values());
    }

    private String snippet(String text) {
        if (text == null) return "";
        String flat = text.replaceAll("\\s+", " ").trim();
        return flat.length() <= SNIPPET_CHARS ? flat : flat.substring(0, SNIPPET_CHARS) + "…";
    }
}
