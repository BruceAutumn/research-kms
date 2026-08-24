package com.kms.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface NoteRepository extends JpaRepository<Note, Long> {
    @Query("""
            select n from Note n
            where n.userId = :userId
              and (:q is null or :q = ''
                   or lower(n.title) like lower(concat('%', :q, '%'))
                   or lower(n.content) like lower(concat('%', :q, '%')))
            order by n.updatedAt desc nulls last, n.id desc
            """)
    List<Note> search(@Param("userId") Long userId, @Param("q") String q);

    Optional<Note> findByIdAndUserId(Long id, Long userId);
    Optional<Note> findByUserIdAndTitle(Long userId, String title);

    @Query("""
            select n from Note n join NoteLink l on l.sourceNoteId = n.id
            where n.userId = :userId and l.targetTitle = :targetTitle
            order by n.updatedAt desc nulls last, n.id desc
            """)
    List<Note> findBacklinks(@Param("userId") Long userId, @Param("targetTitle") String targetTitle);

    // ---- Phase 4: Vault 索引缓存查询（path 为准） ----

    Optional<Note> findByPath(String path);

    List<Note> findByPathIn(List<String> paths);

    Optional<Note> findFirstByPaperIdOrderByUpdatedAtDesc(Long paperId);

    List<Note> findByPaperIdOrderByUpdatedAtDesc(Long paperId);

    List<Note> findByTitleIgnoreCase(String title);

    @Query("select n from Note n where n.path is not null order by n.title")
    List<Note> findAllIndexed();

    /** PostgreSQL tsvector 全文检索（标题加权 > 正文）。 */
    @Query(value = """
            select n.* from notes n
            where n.search_vector @@ plainto_tsquery('simple', :q)
            order by ts_rank(n.search_vector, plainto_tsquery('simple', :q)) desc, n.updated_at desc
            limit 50
            """, nativeQuery = true)
    List<Note> searchByTsvector(@Param("q") String q);

    @Query("""
            select n from Note n
            where n.path is not null
              and (lower(n.title) like lower(concat('%', :q, '%')) or :q = '')
            order by n.title
            """)
    List<Note> searchByTitleOnly(@Param("q") String q);

    /** 更新 tsvector（中文 bigram token 已在 Java 侧生成）。 */
    @Modifying
    @Query(value = """
            update notes
            set search_vector =
                setweight(to_tsvector('simple', :tokens), 'A')
            where id = :id
            """, nativeQuery = true)
    void updateSearchVector(@Param("id") Long id, @Param("tokens") String tokens);
}
