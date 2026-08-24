package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.dto.AgentStepEvent;
import com.kms.agent.dto.RunAgentRequest;
import com.kms.ai.OpenAiCompatibleClient;
import com.kms.ai.dto.ChatMessageDto;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

/**
 * "Write tool no confirm no persist"regression test. 
 *
 * this is Phase 6 Fivesuccess criteriaOne, before this 0 evidence -- append-to-note / update-paper-metadata
 * from write to commitOneneverExecutepass, gate effectiveness is assumption. 
 *
 * tested is AgentRunner semantics of this line in: 
 *   if (tool.isWriteOperation() && permissionGate != null && !permissionGate.beforeTool(...)) return;
 *
 * use RecordingTool record execute() whether reallyCallto, Instead of log or event text. 
 * Key is deniedWriteToolIsNeverExecuted and approvedWriteToolIsExecuted intoToappear: 
 * no latter positiveToby, former"Not called"Maybe test never reached tool. 
 *
 * Run: cd backend && mvn -q test -Dtest=WriteToolApprovalGateTest
 */
class WriteToolApprovalGateTest {

    /** record execute() Fake tool with real call count.  */
    static class RecordingTool implements Tool {
        private final String name;
        private final boolean write;
        final AtomicInteger executions = new AtomicInteger();

        RecordingTool(String name, boolean write) {
            this.name = name;
            this.write = write;
        }

        @Override public String name() { return name; }
        @Override public String displayName() { return name; }
        @Override public String category() { return "Test"; }
        @Override public String description() { return "test tool"; }
        @Override public JsonNode parameterSchema() { return new ObjectMapper().createObjectNode(); }
        @Override public boolean isWriteOperation() { return write; }
        @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_NOTE; }

        @Override
        public ToolResult execute(ToolContext ctx, JsonNode args) {
            executions.incrementAndGet();
            return ToolResult.message("executed");
        }
    }

    ToolRegistry toolRegistry;
    OpenAiCompatibleClient llmClient;
    AgentService agentService;
    WorkflowStepRepository workflowStepRepository;
    ObjectMapper objectMapper = new ObjectMapper();

    List<AgentStepEvent> events;

    @BeforeEach
    void setUp() {
        toolRegistry = mock(ToolRegistry.class);
        llmClient = mock(OpenAiCompatibleClient.class);
        agentService = mock(AgentService.class);
        workflowStepRepository = mock(WorkflowStepRepository.class);
        events = new ArrayList<>();
    }

    private AgentRunner runnerFor(RecordingTool tool) {
        when(toolRegistry.all()).thenReturn(Map.of(tool.name(), tool));
        when(toolRegistry.get(tool.name())).thenReturn(tool);
        when(toolRegistry.describeForPrompt(any())).thenReturn("- " + tool.name());
        // No. 1 round let LLM Call Tool, No. 2 round finish, Avoid maxSteps repeatCallinterfere count. 
        when(llmClient.complete(any(), any(List.class)))
                .thenReturn("{\"action\":\"" + tool.name() + "\",\"args\":{\"note_id\":1,\"content\":\"x\"}}")
                .thenReturn("{\"action\":\"finish\",\"summary\":\"done\"}");
        return new AgentRunner(toolRegistry, llmClient, objectMapper, agentService, workflowStepRepository, false);
    }

    private RunAgentRequest request() {
        return new RunAgentRequest("Append segment to note 1", null, null, null, List.of());
    }

    // ---------- Core: rejectPath ----------

    @Test
    void deniedWriteToolIsNeverExecuted() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        // gateBack false -- Corresponds to user click"reject", Or after close window 10 minutes timeout. 
        runner.run(request(), events::add, (t, args, affected) -> false);

        assertEquals(0, tool.executions.get(),
                "gate reject then writeToolstillExecute -- reviewBatchbar useless");
        assertTrue(events.stream().anyMatch(e -> "error".equals(e.type())),
                "on gate block shouldFrontendemit error Event");
    }

    /** positiveToby: no such, above"0 time"Maybe never reached tool call.  */
    @Test
    void approvedWriteToolIsExecuted() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add, (t, args, affected) -> true);

        assertEquals(1, tool.executions.get(),
                "gate allowLinewrite afterToolshouldExecuteexactlyOnetime");
    }

    // ---------- gate only on write ----------

    @Test
    void readOnlyToolIsNotBlockedByGate() {
        RecordingTool tool = new RecordingTool("list-annotations", false);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add, (t, args, affected) -> false);

        assertEquals(1, tool.executions.get(),
                "onlyReadToolshould not be write-approvedBatchgate block");
    }

    // ---------- knownLackport: legacy No Gate Entry ----------

    /**
     * AgentRunner.run(request, onEvent) two-arg overload permissionGate pass as null, 
     * write nowTool**without anyConfirmdirectly persist**. current implLikethis(javadoc explicitly as legacy Compat), 
     * this useExampleput thisBehaviornail, makeItscannot be silently treated as"safe"use. 
     * If later tightened to"Reject without gate", this useExampleshould change to assert 0 time. 
     */
    @Test
    void legacyNullGateBypassesApprovalEntirely() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add);

        assertEquals(1, tool.executions.get(),
                "two args run() Reload does no approval now -- this is knownLackport, not via item");
    }
}
