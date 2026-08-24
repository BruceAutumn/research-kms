package com.kms.note;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface NoteTemplateRepository extends JpaRepository<NoteTemplate, Long> {
    List<NoteTemplate> findByScopeOrderBySortOrderAscIdAsc(String scope);
    Optional<NoteTemplate> findByScopeAndIsDefaultTrue(String scope);
    Optional<NoteTemplate> findByScopeAndName(String scope, String name);
}