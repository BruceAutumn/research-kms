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
 * 「写工具不确认不落盘」的回归测试。
 *
 * 这条是 Phase 6 五条成败标准之一，此前 0 证据 —— append-to-note / update-paper-metadata
 * 从写完到提交一次都没被执行过，闸门是否真的挡得住纯属假设。
 *
 * 被测的是 AgentRunner 里这一行的语义：
 *   if (tool.isWriteOperation() && permissionGate != null && !permissionGate.beforeTool(...)) return;
 *
 * 用 RecordingTool 记录 execute() 是否真的被调到，而不是看日志或事件文本。
 * 关键在于 deniedWriteToolIsNeverExecuted 与 approvedWriteToolIsExecuted 成对出现：
 * 没有后者这个正对照，前者「没被调用」可能只是因为测试根本没跑到工具那一步。
 *
 * 运行：cd backend && mvn -q test -Dtest=WriteToolApprovalGateTest
 */
class WriteToolApprovalGateTest {

    /** 记录 execute() 实际调用次数的假工具。 */
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
        // 第 1 轮让 LLM 调用工具，第 2 轮收尾，避免 maxSteps 次重复调用干扰计数。
        when(llmClient.complete(any(), any(List.class)))
                .thenReturn("{\"action\":\"" + tool.name() + "\",\"args\":{\"note_id\":1,\"content\":\"x\"}}")
                .thenReturn("{\"action\":\"finish\",\"summary\":\"done\"}");
        return new AgentRunner(toolRegistry, llmClient, objectMapper, agentService, workflowStepRepository, false);
    }

    private RunAgentRequest request() {
        return new RunAgentRequest("追加一段到笔记 1", null, null, null, List.of());
    }

    // ---------- 核心：拒绝路径 ----------

    @Test
    void deniedWriteToolIsNeverExecuted() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        // 闸门返回 false —— 对应用户点「拒绝」，或直接关窗后 10 分钟超时。
        runner.run(request(), events::add, (t, args, affected) -> false);

        assertEquals(0, tool.executions.get(),
                "闸门拒绝后写工具仍然执行了 —— 审批栏形同虚设");
        assertTrue(events.stream().anyMatch(e -> "error".equals(e.type())),
                "被闸门挡下时应向前端发出 error 事件");
    }

    /** 正对照：没有这条，上面的「0 次」可能只是因为压根没走到工具调用。 */
    @Test
    void approvedWriteToolIsExecuted() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add, (t, args, affected) -> true);

        assertEquals(1, tool.executions.get(),
                "闸门放行后写工具应当执行恰好一次");
    }

    // ---------- 闸门只作用于写操作 ----------

    @Test
    void readOnlyToolIsNotBlockedByGate() {
        RecordingTool tool = new RecordingTool("list-annotations", false);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add, (t, args, affected) -> false);

        assertEquals(1, tool.executions.get(),
                "只读工具不应被写审批闸门拦截");
    }

    // ---------- 已知缺口：legacy 无闸门入口 ----------

    /**
     * AgentRunner.run(request, onEvent) 的两参重载把 permissionGate 传成 null，
     * 此时写工具**不经任何确认直接落盘**。当前实现如此（javadoc 明示为 legacy 兼容），
     * 本用例把这个行为钉死，使其无法在无人察觉的情况下被当作「安全」使用。
     * 若将来收紧为「无闸门即拒绝」，本用例应随之改为断言 0 次。
     */
    @Test
    void legacyNullGateBypassesApprovalEntirely() {
        RecordingTool tool = new RecordingTool("append-to-note", true);
        AgentRunner runner = runnerFor(tool);

        runner.run(request(), events::add);

        assertEquals(1, tool.executions.get(),
                "两参 run() 重载当前不做任何审批 —— 这是已知缺口，不是通过项");
    }
}
