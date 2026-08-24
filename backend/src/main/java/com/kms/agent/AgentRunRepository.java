package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface AgentRunRepository extends JpaRepository<AgentRun, Long> {
    List<AgentRun> findTop100ByOrderByStartedAtDescIdDesc();
    List<AgentRun> findByStatus(String status);
    long countByLlmModelId(Long llmModelId);
}
