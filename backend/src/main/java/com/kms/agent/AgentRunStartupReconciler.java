package com.kms.agent;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.Map;

@Component
public class AgentRunStartupReconciler implements ApplicationRunner {
    private final AgentRunRepository runRepository;
    private final AgentRunStepRepository stepRepository;

    public AgentRunStartupReconciler(AgentRunRepository runRepository, AgentRunStepRepository stepRepository) {
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        for (AgentRun run : runRepository.findByStatus("RUNNING")) {
            run.setStatus("FAILED");
            run.setError("orphaned_on_restart");
            run.setFinishedAt(OffsetDateTime.now());
            runRepository.save(run);

            AgentRunStep step = new AgentRunStep();
            step.setAgentRunId(run.getId());
            step.setStepOrder((int) stepRepository.countByAgentRunId(run.getId()) + 1);
            step.setEventType("run.failed");
            step.setStatus("FAILED");
            step.setMessage("orphaned_on_restart");
            step.setInput(Map.of());
            step.setOutput(Map.of("code", "ORPHANED_ON_RESTART", "httpStatus", 500, "message", "orphaned_on_restart"));
            step.setError("orphaned_on_restart");
            stepRepository.save(step);
        }
    }
}
