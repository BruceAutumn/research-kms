package com.kms.search;

import com.kms.llm.client.LlmClientFactory;
import com.kms.llm.model.LlmModel;
import com.kms.note.Note;
import com.kms.note.NoteRepository;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import com.kms.paper.PaperService;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 段落级 embedding 生成。
 *
 * 与 V10 版本的区别（见 V11 迁移头部的完整理由）：
 *   - 旧：整篇 pdf_text 截断到 8000 字符 -> 一篇论文一个向量 -> 只能回答「哪篇大概相关」
 *   - 新：切块 -> 每块一个向量 -> 能回答「哪一段讲了这个」，并带回页码
 *
 * 幂等性靠 embedding_chunk 的 uq_chunk (source_type, source_id, chunk_index, model) 约束，
 * 重跑用 ON CONFLICT DO NOTHING，不产生重复行。
 * 单块失败不中断整批，最后汇总 {ok, failed, errors}。
 */
@Service
public class EmbeddingService {
    private static final Logger log = LoggerFactory.getLogger(EmbeddingService.class);
    private static final int MAX_ERRORS_REPORTED = 20;

    private final LlmClientFactory llmClientFactory;
    private final PaperRepository paperRepository;
    private final NoteRepository noteRepository;
    private final JdbcTemplate jdbcTemplate;
    private final ChunkingService chunkingService;

    public EmbeddingService(LlmClientFactory llmClientFactory, PaperRepository paperRepository,
                            NoteRepository noteRepository, JdbcTemplate jdbcTemplate,
                            ChunkingService chunkingService) {
        this.llmClientFactory = llmClientFactory;
        this.paperRepository = paperRepository;
        this.noteRepository = noteRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.chunkingService = chunkingService;
    }

    /** 一次批量回填的结果汇总。 */
    public record BatchResult(int ok, int failed, int sources, List<String> errors) {}

    // ------------------------------------------------------------------
    // papers
    // ------------------------------------------------------------------

    public Map<String, Object> embedPapers() {
        LlmModel model = llmClientFactory.embeddingModel(null);
        List<Paper> papers = paperRepository.findAll().stream()
                .filter(p -> p.getPdfText() != null && !p.getPdfText().isBlank())
                .toList();

        int ok = 0, skipped = 0, failed = 0, sources = 0;
        List<String> errors = new ArrayList<>();
        for (Paper paper : papers) {
            List<PageText> pages = readPages(paper);
            if (pages.isEmpty()) continue;
            sources++;
            int chunkIndex = 0;
            for (PageText page : pages) {
                for (ChunkingService.Chunk chunk : chunkingService.chunk(page.text())) {
                    try {
                        float[] vector = llmClientFactory.embedWith(model, chunk.text());
                        if (insertChunk("paper", paper.getId(), chunkIndex++, page.page(),
                                chunk.charStart(), chunk.charEnd(), chunk.text(), model, vector)) {
                            ok++;
                        } else {
                            skipped++;
                        }
                    } catch (Exception ex) {
                        failed++;
                        if (errors.size() < MAX_ERRORS_REPORTED) {
                            errors.add("paper#" + paper.getId() + " chunk#" + chunkIndex + ": " + ex.getMessage());
                        }
                        chunkIndex++;
                    }
                }
            }
    log.info("Embedded paper {} -> {} new / {} existing / {} failed", paper.getId(), ok, skipped, failed);
        }
        return summary(model, ok, skipped, failed, sources, errors);
    }

    // ------------------------------------------------------------------
    // notes
    // ------------------------------------------------------------------

    public Map<String, Object> embedNotes() {
        LlmModel model = llmClientFactory.embeddingModel(null);
        List<Note> notes = noteRepository.findAllIndexed().stream()
                .filter(n -> n.getContent() != null && !n.getContent().isBlank())
                .toList();

        int ok = 0, skipped = 0, failed = 0, sources = 0;
        List<String> errors = new ArrayList<>();
        for (Note note : notes) {
            String text = (note.getTitle() == null ? "" : note.getTitle() + "\n\n") + note.getContent();
            List<ChunkingService.Chunk> chunks = chunkingService.chunk(text);
            if (chunks.isEmpty()) continue;
            sources++;
            for (ChunkingService.Chunk chunk : chunks) {
                try {
                    float[] vector = llmClientFactory.embedWith(model, chunk.text());
                    // note 没有页码概念，page 存 NULL。
                    if (insertChunk("note", note.getId(), chunk.index(), null,
                            chunk.charStart(), chunk.charEnd(), chunk.text(), model, vector)) {
                        ok++;
                    } else {
                        skipped++;
                    }
                } catch (Exception ex) {
                    failed++;
                    if (errors.size() < MAX_ERRORS_REPORTED) {
                        errors.add("note#" + note.getId() + " chunk#" + chunk.index() + ": " + ex.getMessage());
                    }
                }
            }
        }
        return summary(model, ok, skipped, failed, sources, errors);
    }

    public float[] embedQuery(String query) {
        LlmModel model = llmClientFactory.embeddingModel(null);
        return llmClientFactory.embedWith(model, query == null ? "" : query);
    }

    public String currentModelId() {
        return llmClientFactory.embeddingModel(null).getModelId();
    }

    // ------------------------------------------------------------------
    // 内部
    // ------------------------------------------------------------------

    private record PageText(int page, String text) {}

    /**
     * 按页取正文，让 chunk 能带上真实页码（双向跳转和「命中在第几页」都依赖它）。
     * pdf_text 是 PDFTextStripper 一次性抽的扁平文本，不含页分隔符，所以这里重新按页读原 PDF。
     * 原 PDF 不可用时退回整篇 pdf_text，页码记为 null —— 宁可没有页码，也不编一个。
     */
    private List<PageText> readPages(Paper paper) {
        List<PageText> pages = new ArrayList<>();
        String path = paper.getPdfPath();
        if (path != null && !path.isBlank() && new File(path).isFile()) {
            try (PDDocument document = Loader.loadPDF(new File(path))) {
                int total = document.getNumberOfPages();
                for (int i = 1; i <= total; i++) {
                    PDFTextStripper stripper = new PDFTextStripper();
                    stripper.setStartPage(i);
                    stripper.setEndPage(i);
                    // 必须复用 PaperService 的清洗：PDF 抽出的文本含裸 0x00 与其他控制字符，
                    // 直接入库会被 Postgres 以 "invalid byte sequence for encoding UTF8: 0x00" 拒绝。
                    String text = PaperService.sanitizePdfText(stripper.getText(document));
                    if (text != null && !text.isBlank()) pages.add(new PageText(i, text));
                }
                return pages;
            } catch (Exception ex) {
                log.warn("按页读取 PDF 失败，退回 pdf_text（页码将为空）: paper={} err={}", paper.getId(), ex.getMessage());
            }
        }
        pages.add(new PageText(-1, paper.getPdfText()));
        return pages;
    }

    /** @return true = 新插入；false = 已存在（uq_chunk 命中，幂等重跑的正常情况）。 */
    private boolean insertChunk(String sourceType, Long sourceId, int chunkIndex, Integer page,
                                int charStart, int charEnd, String text, LlmModel model, float[] vector) {
        return jdbcTemplate.update("""
                INSERT INTO embedding_chunk
                    (source_type, source_id, chunk_index, page, char_start, char_end, text, model, dim, embedding)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?::vector)
                ON CONFLICT ON CONSTRAINT uq_chunk DO NOTHING
                """,
                sourceType, sourceId, chunkIndex,
                page == null || page < 0 ? null : page,
                charStart, charEnd, text,
                model.getModelId(), vector.length, toVectorString(vector)) > 0;
    }

    private Map<String, Object> summary(LlmModel model, int ok, int skipped, int failed, int sources, List<String> errors) {
        Map<String, Object> result = new LinkedHashMap<>();
        // ok 只统计真正新插入的行。把 ON CONFLICT 的空操作也算成 ok 会让「重跑」看起来像
        // 「又生成了一批」，掩盖幂等是否真的生效。
        result.put("ok", ok);
        result.put("skipped", skipped);
        result.put("failed", failed);
        result.put("sources", sources);
        result.put("model", model.getModelId());
        result.put("errors", errors);
        return result;
    }

    static String toVectorString(float[] embedding) {
        StringBuilder sb = new StringBuilder("[");
        for (int i = 0; i < embedding.length; i++) {
            if (i > 0) sb.append(',');
            sb.append(embedding[i]);
        }
        sb.append(']');
        return sb.toString();
    }
}
