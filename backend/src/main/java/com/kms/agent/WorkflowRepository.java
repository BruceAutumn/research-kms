package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface WorkflowRepository extends JpaRepository<Workflow, Long> {
    List<Workflow> findByUserIdOrderByUpdatedAtDescIdDesc(Long userId);
    Optional<Workflow> findByIdAndUserId(Long id, Long userId);
}
