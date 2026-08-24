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
 * Paragraph-level embedding Generate. 
 *
 * and V10 version diff(see V11 migration head full reason): 
 *   - Old: Whole pdf_text truncate to 8000 char -> One vector per paper -> Can only answer"Which roughly relevant"
 *   - New: Chunk -> One vector per block -> Can answer"Which paragraph covers this", and bring page numbers
 *
 * idempotency via embedding_chunk   uq_chunk (source_type, source_id, chunk_index, model) constraint, 
 * rerun uses ON CONFLICT DO NOTHING, no duplicateLine. 
 * Single block failure does not break batch, final summary {ok, failed, errors}. 
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

    /** OnetimeBatchbackfill result summary.  */
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
                    // note noPage Numberconcept, page store NULL. 
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
    // Internal
    // ------------------------------------------------------------------

    private record PageText(int page, String text) {}

    /**
     * Get body by page, let chunk can bringRealPage Number(Bidirectional jump and"Hit on page"all depend on it). 
     * pdf_text is PDFTextStripper Oneflat text extracted at once, not containPageSeparatesymbol, so thisinre-NewByPageReadOriginal PDF. 
     * Original PDF notAvailablewhen fall backWhole pdf_text, Page number is null -- ratherCannoPage Number, Do not fabricate. 
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
                    // Must reuse PaperService cleanup: PDF extracted text has raw 0x00 and other control chars, 
                    // direct import will Postgres with "invalid byte sequence for encoding UTF8: 0x00" reject. 
                    String text = PaperService.sanitizePdfText(stripper.getText(document));
                    if (text != null && !text.isBlank()) pages.add(new PageText(i, text));
                }
                return pages;
            } catch (Exception ex) {
                log.warn("Read by page PDF Failed, fall back pdf_text(Page number will be empty): paper={} err={}", paper.getId(), ex.getMessage());
            }
        }
        pages.add(new PageText(-1, paper.getPdfText()));
        return pages;
    }

    /** @return true = New Insert; false = Exists(uq_chunk Hit, normal idempotent rerun).  */
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
        // ok only count realNew Insert Line.   ON CONFLICT  EmptyoperationAlsocount as ok will let"rerun"looks like
        // "alsoGenerateOneBatch", mask idempotency. 
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
