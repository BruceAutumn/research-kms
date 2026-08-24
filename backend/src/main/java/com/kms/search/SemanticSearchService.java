package com.kms.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Paragraph-level semantic search. 
 *
 * Query embedding_chunk take top-K chunk, Aggregate back paper / note layer: Keep only highest-scoring block per source, 
 * and put hits chunk text segmentSegmentandPage NumberOnestartBack -- researchToolwantAnsweris"Which paragraph covers this", 
 * Only give one paper id Similarity percentage alone is not enough. 
 *
 * onlyComparesameOne model Generated Vector: Old vectors remain after model change, Mixing for cosine distance is meaningless. 
 */
@Service
public class SemanticSearchService {
    /** Take more before aggregate chunk, else sameOnepaperPapermultipleBlockwill put top-K fill, Not enough sources.  */
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
     * in singlePaperInternalByquestion retrieve most relevantParagraph. 
     *
     * Reader in  AI Chat originally fed SectionExcerpt static chapter excerpt(12000 char cap), 
     * Onepaper 73000 charPaperhas 83% Never reached model, and excerpt contentandUserasked what irrelevant --
     * this is"feels incomplete"directOriginalbecause. change toByquestion take top-K after paragraph, 
     * Model sees truly relevant text, Instead of fixed head chapters. 
     *
     * @return each item has page / snippet / similarity, By relevance desc. 
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

        // Aggregate back to source layer: sameOne paper/note Keep only highest-scoring block(Query sorted by distance, First occurrence highest). 
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
        return flat.length() <= SNIPPET_CHARS ? flat : flat.substring(0, SNIPPET_CHARS) + "...";
    }
}
