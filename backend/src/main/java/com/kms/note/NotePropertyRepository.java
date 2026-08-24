package com.kms.note;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface NotePropertyRepository extends JpaRepository<NoteProperty, Long> {
    List<NoteProperty> findByNoteId(Long noteId);

    void deleteByNoteId(Long noteId);
}
