package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface AgentRunStepRepository extends JpaRepository<AgentRunStep, Long> {
    List<AgentRunStep> findByAgentRunIdOrderByIdAsc(Long agentRunId);
    long countByAgentRunId(Long agentRunId);
    long countByAgentRunIdIn(List<Long> agentRunIds);

    @Modifying
    @Query("delete from AgentRunStep s where s.agentRunId in :agentRunIds")
    int deleteByAgentRunIdIn(@Param("agentRunIds") List<Long> agentRunIds);
}
