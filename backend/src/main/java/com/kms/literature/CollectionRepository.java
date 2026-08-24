package com.kms.literature;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface CollectionRepository extends JpaRepository<Collection, Long> {
    List<Collection> findByUserIdOrderBySortOrderAscIdAsc(Long userId);

    Optional<Collection> findByIdAndUserId(Long id, Long userId);

    @Query("select c from Collection c where c.userId = :userId and c.parentId = :parentId order by c.sortOrder asc, c.id asc")
    List<Collection> findByUserIdAndParentId(@Param("userId") Long userId, @Param("parentId") Long parentId);

    @Query("select c, (select count(ci) from CollectionItem ci where ci.collectionId = c.id) " +
            "from Collection c where c.userId = :userId order by c.sortOrder asc, c.id asc")
    List<Object[]> listWithCounts(@Param("userId") Long userId);

    @Query(value = "select ci.paper_id from collection_item ci where ci.collection_id = :collectionId order by ci.created_at asc", nativeQuery = true)
    List<Long> findPaperIds(@Param("collectionId") Long collectionId);
}
