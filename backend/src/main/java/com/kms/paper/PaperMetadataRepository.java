package com.kms.paper;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PaperMetadataRepository extends JpaRepository<PaperMetadata, Long> {
    List<PaperMetadata> findByPaperIdOrderByIdAsc(Long paperId);
    void deleteByPaperId(Long paperId);
    Optional<PaperMetadata> findByPaperIdAndKey(Long paperId, String key);
}
