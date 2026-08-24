package com.kms.literature;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.ai.dto.ExtractedField;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.dto.AiExtractionDto;
import com.kms.paper.Paper;
import com.kms.paper.PaperMetadata;
import com.kms.paper.PaperMetadataRepository;
import com.kms.paper.PaperRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * AI 提取结果的持久化与可追溯：
 * - 结果先落 ai_extraction（PENDING），绝不直接写 papers / paper_metadata；
 * - Accept 前先在 metadata_snapshot 留修改前快照（可回滚）；
 * - Reject 保留记录（REJECTED），供以后评估 Prompt 质量；
 * - Edit 存用户修正值并保留 AI 原值。
 */
@Service
public class ExtractionService {
    private final AiExtractionRepository aiExtractionRepository;
    private final MetadataSnapshotRepository snapshotRepository;
    private final PaperRepository paperRepository;
    private final PaperMetadataRepository metadataRepository;
    private final ObjectMapper objectMapper;

    public ExtractionService(AiExtractionRepository aiExtractionRepository,
                             MetadataSnapshotRepository snapshotRepository,
                             PaperRepository paperRepository,
                             PaperMetadataRepository metadataRepository,
                             ObjectMapper objectMapper) {
        this.aiExtractionRepository = aiExtractionRepository;
        this.snapshotRepository = snapshotRepository;
        this.paperRepository = paperRepository;
        this.metadataRepository = metadataRepository;
        this.objectMapper = objectMapper;
    }

    /** 新一次提取：清掉旧的 PENDING（未处理过的），保留 ACCEPTED/REJECTED/EDITED 历史。 */
    @Transactional
    public List<AiExtractionDto> storePending(Paper paper, List<ExtractedField> fields, String modelUsed) {
        aiExtractionRepository.deleteByPaperIdAndStatus(paper.getId(), AiExtraction.STATUS_PENDING);
        List<AiExtraction> rows = new ArrayList<>();
        for (ExtractedField field : fields) {
            if (field.key() == null || field.key().isBlank()) continue;
            AiExtraction row = new AiExtraction();
            row.setPaperId(paper.getId());
            row.setField(field.key());
            row.setFieldGroup(field.group() == null || field.group().isBlank() ? "custom" : field.group());
            row.setOriginalValue(originalValue(paper, field.key()));
            row.setExtractedValue(field.value());
            row.setConfidence(field.confidence());
            row.setStatus(AiExtraction.STATUS_PENDING);
            row.setModelUsed(modelUsed);
            rows.add(row);
        }
        aiExtractionRepository.saveAll(rows);
        return list(paper.getId());
    }

    public List<AiExtractionDto> list(Long paperId) {
        return aiExtractionRepository.findByPaperIdOrderByIdAsc(paperId).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional
    public AiExtractionDto accept(Long id) {
        AiExtraction row = findRow(id);
        if (row.getStatus().equals(AiExtraction.STATUS_ACCEPTED)) return toDto(row);
        Paper paper = findPaper(row.getPaperId());
        saveSnapshot(paper, "accept:" + row.getField());
        applyValue(paper, row.getField(), row.getUserValue() != null ? row.getUserValue() : row.getExtractedValue());
        row.setStatus(AiExtraction.STATUS_ACCEPTED);
        aiExtractionRepository.save(row);
        recomputeAiStatus(paper.getId());
        return toDto(row);
    }

    @Transactional
    public AiExtractionDto reject(Long id) {
        AiExtraction row = findRow(id);
        // 关键语义：Reject 不写 papers / paper_metadata，只留 REJECTED 记录
        row.setStatus(AiExtraction.STATUS_REJECTED);
        aiExtractionRepository.save(row);
        recomputeAiStatus(row.getPaperId());
        return toDto(row);
    }

    @Transactional
    public AiExtractionDto edit(Long id, String userValue) {
        AiExtraction row = findRow(id);
        row.setUserValue(userValue);
        row.setStatus(AiExtraction.STATUS_EDITED);
        aiExtractionRepository.save(row);
        return toDto(row);
    }

    /** Accept All：一次快照，逐条应用（应用 userValue，否则 AI 原值）。 */
    @Transactional
    public List<AiExtractionDto> acceptAll(Long paperId) {
        Paper paper = findPaper(paperId);
        List<AiExtraction> rows = aiExtractionRepository.findByPaperIdOrderByIdAsc(paperId);
        List<AiExtraction> todo = rows.stream()
                .filter(r -> !r.getStatus().equals(AiExtraction.STATUS_ACCEPTED)
                        && !r.getStatus().equals(AiExtraction.STATUS_REJECTED))
                .toList();
        if (todo.isEmpty()) return list(paperId);
        saveSnapshot(paper, "accept-all");
        for (AiExtraction row : todo) {
            applyValue(paper, row.getField(), row.getUserValue() != null ? row.getUserValue() : row.getExtractedValue());
            row.setStatus(AiExtraction.STATUS_ACCEPTED);
            aiExtractionRepository.save(row);
        }
        recomputeAiStatus(paperId);
        return list(paperId);
    }

    public List<MetadataSnapshot> snapshots(Long paperId) {
        return snapshotRepository.findByPaperIdOrderByIdDesc(paperId);
    }

    // ---------------------------------------------------------------- 内部

    private AiExtraction findRow(Long id) {
        return aiExtractionRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Extraction row not found."));
    }

    private Paper findPaper(Long paperId) {
        return paperRepository.findByIdAndUserId(paperId, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Paper not found."));
    }

    /** 应用提取值：书目字段写 papers 表，其余写 paper_metadata（KV）。 */
    private void applyValue(Paper paper, String field, String value) {
        if (value == null) return;
        switch (field.toLowerCase()) {
            case "title" -> paper.setTitle(value);
            case "authors", "author" -> paper.setAuthors(value);
            case "journal" -> paper.setJournal(value);
            case "year" -> {
                try {
                    paper.setYear(Integer.valueOf(value.replaceAll("[^0-9]", "")));
                } catch (NumberFormatException ignored) {
                    // 解析不了就不写，保留原值
                }
            }
            case "doi" -> paper.setDoi(value);
            case "volume" -> paper.setVolume(value);
            case "pages" -> paper.setPages(value);
            case "url" -> paper.setUrl(value);
            case "abstract" -> { if (paper.getAbstractText() == null || paper.getAbstractText().isBlank()) paper.setAbstractText(value); }
            case "keywords", "tags" -> {
                String[] tags = value.split("[,;，；/]+");
                List<String> cleaned = new ArrayList<>();
                for (String tag : tags) {
                    String trimmed = tag.trim();
                    if (!trimmed.isBlank() && !cleaned.contains(trimmed)) cleaned.add(trimmed);
                }
                if (!cleaned.isEmpty()) paper.setTags(cleaned.toArray(new String[0]));
            }
            default -> {
                metadataRepository.findByPaperIdAndKey(paper.getId(), field).ifPresentOrElse(
                        existing -> {
                            existing.setValue(value);
                            metadataRepository.save(existing);
                        },
                        () -> {
                            PaperMetadata row = new PaperMetadata();
                            row.setPaperId(paper.getId());
                            row.setKey(field);
                            row.setValue(value);
                            metadataRepository.save(row);
                        }
                );
            }
        }
        paper.setDateModified(OffsetDateTime.now());
        paperRepository.save(paper);
    }

    private String originalValue(Paper paper, String field) {
        return switch (field.toLowerCase()) {
            case "title" -> paper.getTitle();
            case "authors", "author" -> paper.getAuthors();
            case "journal" -> paper.getJournal();
            case "year" -> paper.getYear() == null ? null : String.valueOf(paper.getYear());
            case "doi" -> paper.getDoi();
            case "volume" -> paper.getVolume();
            case "pages" -> paper.getPages();
            case "url" -> paper.getUrl();
            case "abstract" -> paper.getAbstractText();
            case "keywords", "tags" -> paper.getTags() == null ? null : String.join("; ", paper.getTags());
            default -> metadataRepository.findByPaperIdAndKey(paper.getId(), field)
                    .map(PaperMetadata::getValue)
                    .orElse(null);
        };
    }

    /** 修改前快照：papers 核心列 + 全部 paper_metadata，存 jsonb。 */
    private void saveSnapshot(Paper paper, String reason) {
        Map<String, Object> paperMap = new LinkedHashMap<>();
        paperMap.put("title", paper.getTitle());
        paperMap.put("authors", paper.getAuthors());
        paperMap.put("journal", paper.getJournal());
        paperMap.put("year", paper.getYear());
        paperMap.put("doi", paper.getDoi());
        paperMap.put("abstract", paper.getAbstractText());
        paperMap.put("tags", paper.getTags());
        paperMap.put("volume", paper.getVolume());
        paperMap.put("pages", paper.getPages());
        paperMap.put("url", paper.getUrl());

        List<Map<String, String>> metadataMap = metadataRepository.findByPaperIdOrderByIdAsc(paper.getId())
                .stream()
                .map(row -> Map.of("key", row.getKey(), "value", row.getValue() == null ? "" : row.getValue()))
                .toList();

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("paper", paperMap);
        snapshot.put("metadata", metadataMap);
        try {
            MetadataSnapshot row = new MetadataSnapshot();
            row.setPaperId(paper.getId());
            row.setSnapshot(objectMapper.writeValueAsString(snapshot));
            row.setReason(reason);
            snapshotRepository.save(row);
        } catch (JsonProcessingException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to serialize snapshot: " + ex.getMessage());
        }
    }

    /** 无 PENDING/EDITED 剩余时 → COMPLETED。 */
    private void recomputeAiStatus(Long paperId) {
        long pending = aiExtractionRepository.countByPaperIdAndStatusIn(paperId,
                List.of(AiExtraction.STATUS_PENDING, AiExtraction.STATUS_EDITED));
        if (pending == 0 && aiExtractionRepository.countByPaperId(paperId) > 0) {
            paperRepository.findById(paperId).ifPresent(paper -> {
                paper.setAiStatus("COMPLETED");
                paperRepository.save(paper);
            });
        }
    }

    private AiExtractionDto toDto(AiExtraction row) {
        return new AiExtractionDto(
                row.getId(), row.getPaperId(), row.getField(), row.getFieldGroup(),
                row.getOriginalValue(), row.getExtractedValue(), row.getConfidence(),
                row.getStatus(), row.getUserValue(), row.getModelUsed(),
                row.getCreatedAt(), row.getUpdatedAt());
    }
}
