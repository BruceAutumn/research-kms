package com.kms.note;

import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.AiExtraction;
import com.kms.literature.AiExtractionRepository;
import com.kms.literature.Annotation;
import com.kms.literature.AnnotationRepository;
import com.kms.note.dto.NotePreviewResult;
import com.kms.note.dto.NoteTemplateDto;
import com.kms.paper.Paper;
import com.kms.paper.PaperMetadata;
import com.kms.paper.PaperMetadataRepository;
import com.kms.paper.PaperRepository;
import com.kms.note.NoteTemplateRenderer.AnnotationInfo;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class NoteTemplateService {

    private final NoteTemplateRepository templateRepository;
    private final PaperRepository paperRepository;
    private final PaperMetadataRepository metadataRepository;
    private final AiExtractionRepository extractionRepository;
    private final AnnotationRepository annotationRepository;

    public NoteTemplateService(NoteTemplateRepository templateRepository,
                               PaperRepository paperRepository,
                               PaperMetadataRepository metadataRepository,
                               AiExtractionRepository extractionRepository,
                               AnnotationRepository annotationRepository) {
        this.templateRepository = templateRepository;
        this.paperRepository = paperRepository;
        this.metadataRepository = metadataRepository;
        this.extractionRepository = extractionRepository;
        this.annotationRepository = annotationRepository;
    }

    public List<NoteTemplateDto> list(String scope) {
        String s = scope == null || scope.isBlank() ? "paper" : scope;
        return templateRepository.findByScopeOrderBySortOrderAscIdAsc(s).stream()
                .map(this::toDto).toList();
    }

    public NoteTemplateDto get(Long id) {
        return toDto(findTemplate(id));
    }

    @Transactional
    public NoteTemplateDto create(NoteTemplateDto dto) {
        NoteTemplate t = new NoteTemplate();
        t.setName(dto.name());
        t.setScope(dto.scope() != null ? dto.scope() : "paper");
        t.setBody(dto.body());
        t.setIsDefault(dto.isDefault() != null && dto.isDefault());
        t.setIsBuiltin(false);
        t.setSortOrder(dto.sortOrder() != null ? dto.sortOrder() : 0);
        if (t.getIsDefault()) clearOtherDefault(t.getScope(), null);
        return toDto(templateRepository.save(t));
    }

    @Transactional
    public NoteTemplateDto update(Long id, NoteTemplateDto dto) {
        NoteTemplate t = findTemplate(id);
        if (t.getIsBuiltin() && dto.body() != null && !dto.body().equals(t.getBody())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "内置模板不允许修改 body");
        }
        if (dto.name() != null) t.setName(dto.name());
        if (dto.scope() != null) t.setScope(dto.scope());
        if (dto.body() != null && !t.getIsBuiltin()) t.setBody(dto.body());
        if (dto.isDefault() != null) {
            t.setIsDefault(dto.isDefault());
            if (dto.isDefault()) clearOtherDefault(t.getScope(), id);
        }
        if (dto.sortOrder() != null) t.setSortOrder(dto.sortOrder());
        return toDto(templateRepository.save(t));
    }

    @Transactional
    public void delete(Long id) {
        NoteTemplate t = findTemplate(id);
        if (t.getIsBuiltin()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "内置模板不允许删除");
        }
        templateRepository.delete(t);
    }

    @Transactional
    public NoteTemplateDto setDefault(Long id) {
        NoteTemplate t = findTemplate(id);
        clearOtherDefault(t.getScope(), id);
        t.setIsDefault(true);
        return toDto(templateRepository.save(t));
    }

    public NotePreviewResult preview(Long paperId, Long templateId, boolean resolveAi) {
        Paper paper = paperRepository.findById(paperId)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Paper not found: " + paperId));
        NoteTemplate template = findTemplate(templateId);
        List<PaperMetadata> metadata = metadataRepository.findByPaperIdOrderByIdAsc(paperId);
        List<AiExtraction> extractions = extractionRepository.findByPaperIdOrderByIdAsc(paperId);
        List<AnnotationInfo> annotations = annotationRepository.findByPaperIdAndUserIdOrderByPageAscIdAsc(paperId, CurrentUser.ID).stream()
                .map(a -> new AnnotationInfo(a.getId(), a.getPage(), a.getSelectedText(), a.getComment()))
                .toList();

        NoteTemplateRenderer.RenderResult rr = NoteTemplateRenderer.render(
                template.getBody(), paper, metadata, extractions, annotations, resolveAi);

        String suggestedPath = sanitizeFilename(paper.getTitle()) + ".md";
        return new NotePreviewResult(rr.renderedMarkdown(), suggestedPath, rr.aiPlaceholders(), rr.warnings());
    }

    private NoteTemplate findTemplate(Long id) {
        return templateRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Template not found: " + id));
    }

    private void clearOtherDefault(String scope, Long excludeId) {
        templateRepository.findByScopeAndIsDefaultTrue(scope).ifPresent(d -> {
            if (excludeId == null || !d.getId().equals(excludeId)) {
                d.setIsDefault(false);
                templateRepository.save(d);
            }
        });
    }

    private String sanitizeFilename(String title) {
        if (title == null || title.isBlank()) return "untitled";
        return title.replaceAll("[/\\\\:*?\"<>|]", "-").trim().replaceAll("^[.]+|[.]+$", "")
                .substring(0, Math.min(title.length(), 100));
    }

    private NoteTemplateDto toDto(NoteTemplate t) {
        return new NoteTemplateDto(t.getId(), t.getName(), t.getScope(), t.getBody(),
                t.getIsDefault(), t.getIsBuiltin(), t.getSortOrder(), t.getCreatedAt(), t.getUpdatedAt());
    }
}