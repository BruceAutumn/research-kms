package com.kms.literature;

import com.kms.literature.dto.AnnotationRequest;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/annotations")
public class AnnotationController {
    private final AnnotationService annotationService;

    public AnnotationController(AnnotationService annotationService) {
        this.annotationService = annotationService;
    }

    @GetMapping
    public List<Annotation> list(@RequestParam(required = false) Long paperId) {
        if (paperId == null) {
            return annotationService.listAll();
        }
        return annotationService.list(paperId);
    }

    @PostMapping
    public Annotation create(@RequestBody AnnotationRequest request) {
        return annotationService.create(request);
    }

    @PatchMapping("/{id}")
    public Annotation update(@PathVariable Long id, @RequestBody AnnotationRequest request) {
        return annotationService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        annotationService.delete(id);
    }
}
