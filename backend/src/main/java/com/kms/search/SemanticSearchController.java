package com.kms.search;

import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api")
public class SemanticSearchController {
    private final SemanticSearchService searchService;
    private final EmbeddingService embeddingService;
    private final HybridSearchService hybridSearchService;
    private final GlobalSearchService globalSearchService;

    public SemanticSearchController(SemanticSearchService searchService, EmbeddingService embeddingService, HybridSearchService hybridSearchService, GlobalSearchService globalSearchService) {
        this.searchService = searchService;
        this.embeddingService = embeddingService;
        this.hybridSearchService = hybridSearchService;
        this.globalSearchService = globalSearchService;
    }

    @PostMapping("/search/semantic")
    public Map<String, Object> semanticSearch(@RequestBody SemanticSearchRequest request) {
        if (request.query() == null || request.query().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "查询不能为空。");
        }
        int limit = request.limit() == null ? 10 : Math.max(1, Math.min(50, request.limit()));
        String scope = request.scope() == null ? "all" : request.scope();
        return switch (scope) {
            case "papers" -> Map.of("papers", searchService.searchPapers(request.query(), limit), "notes", java.util.List.of());
            case "notes" -> Map.of("papers", java.util.List.of(), "notes", searchService.searchNotes(request.query(), limit));
            default -> searchService.searchAll(request.query(), limit);
        };
    }

    /**
     * Phase 7 Hybrid Search —— Keyword + Semantic + Metadata Filter 融合检索。
     *
     * 先按 metadata（year/tag/favorite）过滤，再并行跑关键词命中（ILIKE）与语义命中（pgvector），
     * 最后用 RRF（Reciprocal Rank Fusion）合并两路结果。
     */
    @PostMapping("/search/hybrid")
    public Map<String, Object> hybridSearch(@RequestBody HybridSearchRequest request) {
        if (request.query() == null || request.query().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "查询不能为空。");
        }
        int limit = request.limit() == null ? 10 : Math.max(1, Math.min(50, request.limit()));
        return hybridSearchService.hybridSearch(
                request.query(),
                request.tag(),
                request.yearFrom(),
                request.yearTo(),
                request.favoriteOnly(),
                limit
        );
    }

    /**
     * P1-3 Global Search —— 跨类型内容搜索（论文 + 笔记 + 标注）。
     * CommandPalette (⌘K) 输入文字时实时调用，返回三类资源的 top-5 匹配。
     */
    @PostMapping("/search/global")
    public Map<String, Object> globalSearch(@RequestBody GlobalSearchRequest request) {
        if (request.query() == null || request.query().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "查询不能为空。");
        }
        return globalSearchService.globalSearch(request.query().trim());
    }

    /** 返回 {ok, failed, sources, model, errors} —— 单块失败不中断整批，失败明细直接回给调用方。 */
    @PostMapping("/admin/embed-papers")
    public Map<String, Object> embedPapers() {
        return embeddingService.embedPapers();
    }

    @PostMapping("/admin/embed-notes")
    public Map<String, Object> embedNotes() {
        return embeddingService.embedNotes();
    }
}

record SemanticSearchRequest(String query, Integer limit, String scope) {}

record HybridSearchRequest(
        String query,
        String tag,
        Integer yearFrom,
        Integer yearTo,
        Boolean favoriteOnly,
        Integer limit
) {}

record GlobalSearchRequest(String query) {}