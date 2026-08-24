package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AgentPromptVersionRepository extends JpaRepository<AgentPromptVersion, Long> {
    List<AgentPromptVersion> findByAgentIdOrderByVersionDesc(Long agentId);
    Optional<AgentPromptVersion> findByAgentIdAndVersion(Long agentId, Integer version);
    @Query("select coalesce(max(v.version), 0) from AgentPromptVersion v where v.agentId = :agentId")
    int maxVersion(@Param("agentId") Long agentId);
}
