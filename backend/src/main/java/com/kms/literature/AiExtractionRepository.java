package com.kms.literature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AiExtractionRepository extends JpaRepository<AiExtraction, Long> {
    List<AiExtraction> findByPaperIdOrderByIdAsc(Long paperId);

    List<AiExtraction> findByPaperIdAndStatusIn(Long paperId, List<String> statuses);

    @Modifying
    @Query("delete from AiExtraction a where a.paperId = :paperId and a.status = :status")
    int deleteByPaperIdAndStatus(@Param("paperId") Long paperId, @Param("status") String status);

    long countByPaperId(Long paperId);

    long countByPaperIdAndStatusIn(Long paperId, List<String> statuses);
}
