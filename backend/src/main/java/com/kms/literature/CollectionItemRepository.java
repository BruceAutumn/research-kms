package com.kms.literature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface CollectionItemRepository extends JpaRepository<CollectionItem, Long> {
    List<CollectionItem> findByCollectionId(Long collectionId);

    boolean existsByCollectionIdAndPaperId(Long collectionId, Long paperId);

    @Modifying
    @Query("delete from CollectionItem ci where ci.collectionId = :collectionId and ci.paperId = :paperId")
    int deleteByCollectionIdAndPaperId(@Param("collectionId") Long collectionId, @Param("paperId") Long paperId);
}
