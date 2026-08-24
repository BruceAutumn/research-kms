package com.kms.literature;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface MetadataSnapshotRepository extends JpaRepository<MetadataSnapshot, Long> {
    List<MetadataSnapshot> findByPaperIdOrderByIdDesc(Long paperId);
}
