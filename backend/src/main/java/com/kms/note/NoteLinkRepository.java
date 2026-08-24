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

    /** 已解析的入链：target_path = 当前文件。 */
    List<NoteLink> findByTargetPath(String targetPath);

    /** 未解析、但 target_title 指向该标题的入链（[[待创建]] 引用）。 */
    List<NoteLink> findByTargetTitleAndResolvedFalse(String targetTitle);

    List<NoteLink> findByResolvedFalse();

    /** 目标文件出现后，把所有指向该标题的未解析链接改为已解析。 */
    @Modifying
    @Query("update NoteLink l set l.targetPath = :path, l.resolved = true " +
            "where l.targetTitle = :title and l.resolved = false")
    int resolveTitleToPath(@Param("title") String title, @Param("path") String path);

    /** 移动文件后，指向旧路径的已解析链接更新为新路径。 */
    @Modifying
    @Query("update NoteLink l set l.targetPath = :newPath where l.targetPath = :oldPath")
    int updateTargetPath(@Param("oldPath") String oldPath, @Param("newPath") String newPath);
}
