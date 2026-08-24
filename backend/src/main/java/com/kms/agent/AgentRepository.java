package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface AgentRepository extends JpaRepository<Agent, Long> {
    List<Agent> findByUserIdOrderByCreatedAtDesc(Long userId);
    Optional<Agent> findByIdAndUserId(Long id, Long userId);
    long countByLlmModelId(Long llmModelId);
}
