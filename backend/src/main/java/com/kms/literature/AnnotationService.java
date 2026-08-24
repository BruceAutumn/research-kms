package com.kms.literature;

import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.dto.AnnotationRequest;
import com.kms.paper.PaperService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class AnnotationService {
    private final AnnotationRepository annotationRepository;
    private final PaperService paperService;

    public AnnotationService(AnnotationRepository annotationRepository, PaperService paperService) {
        this.annotationRepository = annotationRepository;
        this.paperService = paperService;
    }

    public List<Annotation> list(Long paperId) {
        paperService.findPaper(paperId);
        return annotationRepository.findByPaperIdAndUserIdOrderByPageAscIdAsc(paperId, CurrentUser.ID);
    }

    public List<Annotation> listAll() {
        return annotationRepository.findByUserIdOrderByCreatedAtDesc(CurrentUser.ID);
    }

    @Transactional
    public Annotation create(AnnotationRequest request) {
        if (request.getPaperId() == null || request.getPage() == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "paperId and page are required.");
        }
        paperService.findPaper(request.getPaperId());
        Annotation annotation = new Annotation();
        annotation.setUserId(CurrentUser.ID);
        apply(annotation, request);
        return annotationRepository.save(annotation);
    }

    @Transactional
    public Annotation update(Long id, AnnotationRequest request) {
        Annotation annotation = find(id);
        apply(annotation, request);
        return annotationRepository.save(annotation);
    }

    @Transactional
    public void delete(Long id) {
        annotationRepository.delete(find(id));
    }

    private void apply(Annotation annotation, AnnotationRequest request) {
        if (request.getPaperId() != null) annotation.setPaperId(request.getPaperId());
        if (request.getPage() != null) annotation.setPage(request.getPage());
        if (request.getPosition() != null) annotation.setPosition(request.getPosition());
        if (request.getSelectedText() != null) annotation.setSelectedText(request.getSelectedText());
        if (request.getColor() != null) annotation.setColor(request.getColor());
        if (request.getComment() != null) annotation.setComment(request.getComment());
        if (request.getType() != null) annotation.setType(request.getType());
        if (request.getRectsJson() != null) annotation.setRectsJson(request.getRectsJson());
        if (annotation.getPage() > 0) {
            annotation.setSortKey(annotation.getPage() * 10000.0);
        }
    }

    private Annotation find(Long id) {
        Annotation annotation = annotationRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Annotation not found."));
        if (!annotation.getUserId().equals(CurrentUser.ID)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Annotation not found.");
        }
        return annotation;
    }
}
