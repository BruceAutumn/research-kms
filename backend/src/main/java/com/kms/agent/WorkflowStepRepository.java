package com.kms.agent;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import java.util.List;

public interface WorkflowStepRepository extends JpaRepository<WorkflowStep, Long> {
    List<WorkflowStep> findByWorkflowIdOrderByStepOrderAsc(Long workflowId);
    @Modifying @Query("delete from WorkflowStep s where s.workflowId=:workflowId") void deleteByWorkflowId(@Param("workflowId") Long workflowId);
}
