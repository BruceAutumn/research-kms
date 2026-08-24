package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface AgentToolRepository extends JpaRepository<AgentTool, AgentTool.Key> {
    List<AgentTool> findByAgentIdAndEnabledTrueOrderByToolNameAsc(Long agentId);
    List<AgentTool> findByAgentIdOrderByToolNameAsc(Long agentId);
    @Modifying
    @Query("delete from AgentTool t where t.agentId = :agentId")
    void deleteByAgentId(@Param("agentId") Long agentId);
}
