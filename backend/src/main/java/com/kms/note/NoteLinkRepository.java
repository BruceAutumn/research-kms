package com.kms.note;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface NoteLinkRepository extends JpaRepository<NoteLink, Long> {
    void deleteBySourceNoteId(Long sourceNoteId);

    void deleteBySourcePath(String sourcePath);

    List<NoteLink> findBySourcePath(String sourcePath);

    /** Parsedinbound link: target_path = currentFile.  */
    List<NoteLink> findByTargetPath(String targetPath);

    /** Unresolved, But target_title point to thatTitleinbound link([[Pending Create]] Reference).  */
    List<NoteLink> findByTargetTitleAndResolvedFalse(String targetTitle);

    List<NoteLink> findByResolvedFalse();

    /** targetFileafter appear, put all pointing toTitle UnresolvedLinkchange toParsed.  */
    @Modifying
    @Query("update NoteLink l set l.targetPath = :path, l.resolved = true " +
            "where l.targetTitle = :title and l.resolved = false")
    int resolveTitleToPath(@Param("title") String title, @Param("path") String path);

    /** After move file, point toOldPath ParsedLinkUpdateasNewPath.  */
    @Modifying
    @Query("update NoteLink l set l.targetPath = :newPath where l.targetPath = :oldPath")
    int updateTargetPath(@Param("oldPath") String oldPath, @Param("newPath") String newPath);
}
