package com.kms.search;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * Phase 7 Hybrid Search -- Keyword + Semantic + Metadata Filter Fusion Search. 
 *
 * flow: 
 * 1. Metadata filter(year range / tag / favorite)-- Shrink Candidate Set
 * 2. Keyword Hit(ILIKE title / authors / abstract)-- Exact Match
 * 3. Semantic Hit(pgvector Cosine Distance)-- Concept Match
 * 4. RRF(Reciprocal Rank Fusion)Merge two results -- Composite Sort
 *
 * RRF Formula: score = Sum 1/(k + rank_i), k=60 is industry common. 
 * High keyword rank contributes more, High semantic rank contributes more, Highest score when both rank high. 
 */
@Service
public class HybridSearchService {
    private static final int RRF_K = 60;
    private static final int OVERFETCH = 30;

    private final JdbcTemplate jdbcTemplate;
    private final EmbeddingService embeddingService;

    public HybridSearchService(JdbcTemplate jdbcTemplate, EmbeddingService embeddingService) {
        this.jdbcTemplate = jdbcTemplate;
        this.embeddingService = embeddingService;
    }

    public Map<String, Object> hybridSearch(
            String query, String tag, Integer yearFrom, Integer yearTo, Boolean favoriteOnly, int limit
    ) {
        long userId = com.kms.common.CurrentUser.ID;

        List<Long> candidates = metadataFilter(userId, tag, yearFrom, yearTo, favoriteOnly);
        if (candidates.isEmpty()) {
            Map<String, Object> empty = new LinkedHashMap<>();
            empty.put("papers", List.of());
            empty.put("strategy", "hybrid");
            empty.put("candidateCount", 0);
            return empty;
        }

        List<RankedPaper> keywordHits = keywordSearch(query, candidates);
        List<RankedPaper> semanticHits = semanticSearch(query, candidates);

        List<Map<String, Object>> fused = rrfFuse(keywordHits, semanticHits, limit);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("papers", fused);
        result.put("strategy", "hybrid");
        result.put("candidateCount", candidates.size());
        result.put("keywordHits", keywordHits.size());
        result.put("semanticHits", semanticHits.size());
        return result;
    }

    private List<Long> metadataFilter(long userId, String tag, Integer yearFrom, Integer yearTo, Boolean favoriteOnly) {
        StringBuilder sql = new StringBuilder("SELECT id FROM papers WHERE user_id = ? AND trashed = false");
        List<Object> params = new ArrayList<>();
        params.add(userId);

        if (tag != null && !tag.isBlank()) {
            sql.append(" AND ? = ANY(tags)");
            params.add(tag);
        }
        if (yearFrom != null) {
            sql.append(" AND year >= ?");
            params.add(yearFrom);
        }
        if (yearTo != null) {
            sql.append(" AND year <= ?");
            params.add(yearTo);
        }
        if (Boolean.TRUE.equals(favoriteOnly)) {
            sql.append(" AND favorite = true");
        }

        return jdbcTemplate.queryForList(sql.toString(), Long.class, params.toArray());
    }

    private List<RankedPaper> keywordSearch(String query, List<Long> candidates) {
        if (candidates.isEmpty()) return List.of();
        String pattern = "%" + query.toLowerCase() + "%";
        String sql = """
                SELECT id, title,
                       (CASE WHEN LOWER(title) LIKE ? THEN 3 ELSE 0 END +
                        CASE WHEN LOWER(authors) LIKE ? THEN 1 ELSE 0 END +
                        CASE WHEN LOWER(abstract) LIKE ? THEN 2 ELSE 0 END) AS score
                FROM papers
                WHERE id IN (%s)
                ORDER BY score DESC
                LIMIT ?
                """.formatted(placeholders(candidates.size()));

        List<Object> params = new ArrayList<>();
        params.add(pattern);
        params.add(pattern);
        params.add(pattern);
        params.addAll(candidates);
        params.add(OVERFETCH);

        return jdbcTemplate.query(sql, (rs, rowNum) -> new RankedPaper(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getDouble("score"),
                0.0
        ), params.toArray());
    }

    private List<RankedPaper> semanticSearch(String query, List<Long> candidates) {
        if (candidates.isEmpty()) return List.of();
        float[] embedding;
        try {
            embedding = embeddingService.embedQuery(query);
        } catch (Exception e) {
            return List.of();
        }
        String vectorStr = EmbeddingService.toVectorString(embedding);
        String model = embeddingService.currentModelId();

        String sql = """
                SELECT c.source_id AS id, p.title AS title,
                       1 - (c.embedding <=> ?::vector) AS similarity
                FROM embedding_chunk c
                JOIN papers p ON p.id = c.source_id
                WHERE c.source_type = 'paper' AND c.model = ?
                  AND c.source_id IN (%s)
                ORDER BY c.embedding <=> ?::vector
                LIMIT ?
                """.formatted(placeholders(candidates.size()));

        List<Object> params = new ArrayList<>();
        params.add(vectorStr);
        params.add(model);
        params.addAll(candidates);
        params.add(vectorStr);
        params.add(OVERFETCH);

        Map<Long, RankedPaper> best = new LinkedHashMap<>();
        jdbcTemplate.query(sql, (rs, rowNum) -> {
            long id = rs.getLong("id");
            best.putIfAbsent(id, new RankedPaper(
                    id,
                    rs.getString("title"),
                    0.0,
                    rs.getDouble("similarity")
            ));
            return null;
        }, params.toArray());

        return new ArrayList<>(best.values());
    }

    /**
     * Reciprocal Rank Fusion: score = Sum 1/(k + rank)
     */
    private List<Map<String, Object>> rrfFuse(List<RankedPaper> keywordHits, List<RankedPaper> semanticHits, int limit) {
        Map<Long, Double> scores = new HashMap<>();
        Map<Long, String> titles = new HashMap<>();
        Map<Long, Double> sims = new HashMap<>();

        for (int i = 0; i < keywordHits.size(); i++) {
            RankedPaper p = keywordHits.get(i);
            scores.merge(p.id, 1.0 / (RRF_K + i + 1), Double::sum);
            titles.putIfAbsent(p.id, p.title);
        }

        for (int i = 0; i < semanticHits.size(); i++) {
            RankedPaper p = semanticHits.get(i);
            scores.merge(p.id, 1.0 / (RRF_K + i + 1), Double::sum);
            titles.putIfAbsent(p.id, p.title);
            sims.put(p.id, p.semanticScore);
        }

        return scores.entrySet().stream()
                .sorted(Map.Entry.<Long, Double>comparingByValue().reversed())
                .limit(limit)
                .map(e -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("id", e.getKey());
                    row.put("title", titles.get(e.getKey()));
                    row.put("rrfScore", e.getValue());
                    row.put("similarity", sims.getOrDefault(e.getKey(), 0.0));
                    row.put("hasSemantic", sims.containsKey(e.getKey()));
                    return row;
                })
                .toList();
    }

    private String placeholders(int count) {
        return String.join(",", Collections.nCopies(count, "?"));
    }

    private record RankedPaper(long id, String title, double keywordScore, double semanticScore) {}
}