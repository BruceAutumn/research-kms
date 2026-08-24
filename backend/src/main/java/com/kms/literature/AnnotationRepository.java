package com.kms.literature;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface AnnotationRepository extends JpaRepository<Annotation, Long> {
    List<Annotation> findByPaperIdAndUserIdOrderByPageAscIdAsc(Long paperId, Long userId);

    List<Annotation> findByUserIdOrderByCreatedAtDesc(Long userId);
}
