package com.kms.paper;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PaperRepository extends JpaRepository<Paper, Long> {
    @Query(value = """
            select * from papers p
            where p.user_id = :userId
              and p.trashed = false
              and (:q is null or :q = ''
                   or lower(p.title) like lower(concat('%', cast(:q as text), '%'))
                   or lower(coalesce(p.authors, '')) like lower(concat('%', cast(:q as text), '%')))
              and (:tag is null or :tag = '' or cast(:tag as text) = any(p.tags))
            order by p.created_at desc
            """, nativeQuery = true)
    List<Paper> search(@Param("userId") Long userId, @Param("q") String q, @Param("tag") String tag);

    Optional<Paper> findByIdAndUserId(Long id, Long userId);

    @Query("select p from Paper p where p.userId = :userId and not exists (select 1 from PaperMetadata m where m.paperId = p.id) order by p.createdAt desc")
    List<Paper> findWithoutMetadata(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and exists (select 1 from Note n where n.paperId = p.id) order by p.createdAt desc")
    List<Paper> findWithNotes(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and not exists (select 1 from Note n where n.paperId = p.id) order by p.createdAt desc")
    List<Paper> findWithoutNotes(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = false and p.lastOpenedAt is not null order by p.lastOpenedAt desc")
    List<Paper> findRecentlyRead(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = false and p.favorite = true order by p.createdAt desc")
    List<Paper> findFavorites(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = false and p.lastOpenedAt is null order by p.createdAt desc")
    List<Paper> findUnread(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = false and p.aiStatus = 'COMPLETED' order by p.createdAt desc")
    List<Paper> findAiProcessed(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = false and p.aiStatus <> 'COMPLETED' order by p.createdAt desc")
    List<Paper> findAiPending(@Param("userId") Long userId);

    @Query("select p from Paper p where p.userId = :userId and p.trashed = true order by p.createdAt desc")
    List<Paper> findTrashed(@Param("userId") Long userId);

    /** same Collection / sameTagrelatedPaper(Exclude self and trash).  */
    @Query(value = """
            select distinct p.* from papers p
            where p.user_id = :userId and p.id <> :paperId and p.trashed = false
              and (p.id in (select ci.paper_id from collection_item ci
                            where ci.collection_id in
                                  (select ci2.collection_id from collection_item ci2 where ci2.paper_id = :paperId))
                   or p.tags && (select pp.tags from papers pp where pp.id = :paperId))
            order by p.created_at desc
            limit 20
            """, nativeQuery = true)
    List<Paper> findRelated(@Param("userId") Long userId, @Param("paperId") Long paperId);

    /** Duplicate Detection: By DOI Exact Match(Exclude Trash).  */
    Optional<Paper> findByUserIdAndDoiAndTrashedFalse(Long userId, String doi);

    /** Duplicate Detection: Exact match by title(ignoreLargeLowercase, Exclude Trash).  */
    @Query("select p from Paper p where p.userId = :userId and lower(p.title) = lower(:title) and p.trashed = false")
    Optional<Paper> findByUserIdAndTitleIgnoreCase(@Param("userId") Long userId, @Param("title") String title);
}
