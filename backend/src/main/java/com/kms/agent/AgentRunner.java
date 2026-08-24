package com.kms.agent;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.dto.AgentStepEvent;
import com.kms.agent.dto.RunAgentRequest;
import com.kms.ai.OpenAiCompatibleClient;
import com.kms.ai.dto.ChatMessageDto;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/** Agent Execution Engine: LLM think -> Tool Call -> result backfill.  */
@Component
public class AgentRunner {
    private static final int DEFAULT_MAX_STEPS = 12;

    private final ToolRegistry toolRegistry;
    private final OpenAiCompatibleClient llmClient;
    private final ObjectMapper objectMapper;
    private final AgentService agentService;
    private final WorkflowStepRepository workflowStepRepository;
    private final boolean mockLlm;

    public AgentRunner(ToolRegistry toolRegistry, OpenAiCompatibleClient llmClient, ObjectMapper objectMapper,
                       AgentService agentService, WorkflowStepRepository workflowStepRepository,
                       @Value("${app.llm.mock:false}") boolean mockLlm) {
        this.toolRegistry = toolRegistry;
        this.llmClient = llmClient;
        this.objectMapper = objectMapper;
        this.agentService = agentService;
        this.workflowStepRepository = workflowStepRepository;
        this.mockLlm = mockLlm;
    }

    public void run(RunAgentRequest request, Consumer<AgentStepEvent> onEvent) {
        run(request, onEvent, null);
    }

    /** Run Once Agent Task; permissionGate as null only for when legacy Compat, no interactivePause.  */
    public void run(RunAgentRequest request, Consumer<AgentStepEvent> onEvent, RunPermissionGate permissionGate) {
        if (request == null || request.instruction() == null || request.instruction().isBlank()) {
            onEvent.accept(new AgentStepEvent("error", "Instruction cannot be empty. ", null, null, now()));
            return;
        }
        Agent agent = request.agentId() == null ? null : agentService.find(request.agentId());
        Set<String> allowedTools = allowedTools(agent);
        Long modelConfigId = request.effectiveLlmModelId() != null
                ? request.effectiveLlmModelId()
                : (agent == null ? null : (agent.getLlmModelId() != null ? agent.getLlmModelId() : agent.getModelConfigId()));
        int maxSteps = maxSteps(agent);

        if (agent != null && agent.getWorkflowId() != null) {
            runWorkflow(agent, request, allowedTools, modelConfigId, onEvent, permissionGate);
            return;
        }

        if (mockLlm) {
            runMock(request, allowedTools, modelConfigId, onEvent, permissionGate);
            return;
        }

        String system = AgentPrompt.build(toolRegistry.describeForPrompt(allowedTools), agent == null ? null : agent.getPrompt());
        List<ChatMessageDto> messages = new ArrayList<>();
        messages.add(new ChatMessageDto("system", system));
        messages.add(new ChatMessageDto("user", request.instruction()));

        for (int step = 0; step < maxSteps; step++) {
            onEvent.accept(new AgentStepEvent("thinking", "Think next step...", null, null, now()));
            String raw = llmClient.complete(modelConfigId, messages);
            JsonNode action = parseAction(raw);
            String actionName = action.path("action").asText("").trim();
            String thought = action.path("thought").asText("");

            if (actionName.isEmpty() || "finish".equals(actionName)) {
                onEvent.accept(new AgentStepEvent("done", action.path("summary").asText(raw), null, thought, now()));
                return;
            }
            if (!allowedTools.contains(actionName)) {
                String msg = "Tool not enabled or not in Agent in config: " + actionName;
                onEvent.accept(new AgentStepEvent("error", msg, actionName, "Available Tools: " + String.join(", ", allowedTools), now()));
                return;
            }
            Tool tool = toolRegistry.get(actionName);
            if (tool == null) {
                onEvent.accept(new AgentStepEvent("error", "Unknown Tool: " + actionName, actionName, null, now()));
                return;
            }

            JsonNode args = action.path("args");
            if (tool.isWriteOperation() && permissionGate != null && !permissionGate.beforeTool(tool, args, affectedCount(args))) {
                onEvent.accept(new AgentStepEvent("error", "User rejected or policy blocked write. ", actionName, null, now()));
                return;
            }

            onEvent.accept(new AgentStepEvent("thinking", "Executing " + actionName + (thought.isBlank() ? "" : " -- " + thought), actionName, null, now()));
            messages.add(new ChatMessageDto("assistant", raw));
            try {
                ToolResult result = tool.execute(new ToolContext(agent == null ? null : agent.getId(), null, modelConfigId, request.contextRefs() == null ? List.of() : request.contextRefs()), args);
                String json = result.asJson(objectMapper);
                onEvent.accept(new AgentStepEvent("step", actionName + " Done", actionName, summarize(json), now(), nodeMap(args), nodeMap(result.output()), result.tokenUsage()));
                messages.add(new ChatMessageDto("user", "Tool " + actionName + "  Executeresult:\n" + truncate(json, 6000)));
            } catch (Exception ex) {
                onEvent.accept(new AgentStepEvent("step", actionName + " Failed", actionName, ex.getMessage(), now()));
                messages.add(new ChatMessageDto("user", "Tool " + actionName + " Execution Error:" + ex.getMessage()));
            }
        }
        onEvent.accept(new AgentStepEvent("done", "Max steps reached(" + maxSteps + "),Task End. ", null, null, now()));
    }

    private Set<String> allowedTools(Agent agent) {
        if (agent == null) return new LinkedHashSet<>(toolRegistry.all().keySet());
        return new LinkedHashSet<>(agentService.enabledToolNames(agent.getId()));
    }

    private int maxSteps(Agent agent) {
        if (agent == null || agent.getAdvanced() == null) return DEFAULT_MAX_STEPS;
        Object value = agent.getAdvanced().get("maxIterations");
        if (value instanceof Number n) return Math.max(1, Math.min(50, n.intValue()));
        try { return Math.max(1, Math.min(50, Integer.parseInt(String.valueOf(value)))); } catch (Exception ex) { return DEFAULT_MAX_STEPS; }
    }

    private void runMock(RunAgentRequest request, Set<String> allowedTools, Long modelConfigId,
                         Consumer<AgentStepEvent> onEvent, RunPermissionGate permissionGate) {
        try {
            if (!allowedTools.contains("literature-search")) {
                onEvent.accept(new AgentStepEvent("error", "Tool not enabled or not in Agent in config: literature-search", "literature-search", null, now()));
                return;
            }
            onEvent.accept(new AgentStepEvent("thinking", "Searching library...", "literature-search", null, now()));
            String searchResult = toolRegistry.get("literature-search").execute(new ToolContext(request.agentId(), null, modelConfigId, request.contextRefs()), objectMapper.createObjectNode()).asJson(objectMapper);
            onEvent.accept(new AgentStepEvent("step", "Library search done", "literature-search", summarize(searchResult), now()));

            JsonNode papers = objectMapper.readTree(searchResult).path("papers");
            if (papers.isArray() && papers.size() > 0) {
                long paperId = papers.get(0).path("id").asLong();
                String title = papers.get(0).path("title").asText("UnnamedPaper");
                executeMockTool("pdf-reader", objectMapper.createObjectNode().put("id", paperId), allowedTools, modelConfigId, request, onEvent, permissionGate);
                executeMockTool("metadata-extractor", objectMapper.createObjectNode().put("id", paperId), allowedTools, modelConfigId, request, onEvent, permissionGate);
                JsonNode noteArgs = objectMapper.createObjectNode()
                        .put("title", truncate(title, 180) + " . AI Organize Notes")
                        .put("content", "# " + title + "\n\n(MOCK_LLM)by Agent Demo flow generation, Permission confirm before write. \n");
                executeMockTool("note-writer", noteArgs, allowedTools, modelConfigId, request, onEvent, permissionGate);
            }
            onEvent.accept(new AgentStepEvent("done", "Demo complete. ", null, null, now()));
        } catch (Exception ex) {
            onEvent.accept(new AgentStepEvent("error", ex.getMessage(), null, null, now()));
        }
    }

    private void runWorkflow(Agent agent, RunAgentRequest request, Set<String> allowedTools, Long modelConfigId,
                             Consumer<AgentStepEvent> onEvent, RunPermissionGate permissionGate) {
        List<WorkflowStep> steps = workflowStepRepository.findByWorkflowIdOrderByStepOrderAsc(agent.getWorkflowId());
        if (steps.isEmpty()) {
            onEvent.accept(new AgentStepEvent("done", "Workflow noCanExecuteStep. ", null, null, now()));
            return;
        }
        Map<String, String> outputs = new LinkedHashMap<>();
        for (WorkflowStep step : steps) {
            String toolName = step.getToolName();
            if (!step.isEnabled()) {
                onEvent.accept(new AgentStepEvent("step", "Skip disabled step: " + toolName, toolName, "disabled", now()));
                continue;
            }
            if (!conditionAllows(step.getCondition(), outputs)) {
                onEvent.accept(new AgentStepEvent("step", "condition not met, Skip Step: " + toolName, toolName, step.getCondition(), now()));
                continue;
            }
            if (!allowedTools.contains(toolName)) {
                onEvent.accept(new AgentStepEvent("error", "Tool not enabled or not in Agent in config: " + toolName, toolName, "Available Tools: " + String.join(", ", allowedTools), now()));
                return;
            }
            Tool tool = toolRegistry.get(toolName);
            if (tool == null) {
                onEvent.accept(new AgentStepEvent("error", "Unknown Tool: " + toolName, toolName, null, now()));
                return;
            }
            ObjectNode args = workflowArgs(step, request, outputs);
            if (tool.isWriteOperation() && permissionGate != null && !permissionGate.beforeTool(tool, args, affectedCount(args))) {
                onEvent.accept(new AgentStepEvent("error", "User rejected or policy blocked write. ", toolName, null, now()));
                return;
            }
            int attempts = Math.max(1, retryCount(step));
            for (int attempt = 1; attempt <= attempts; attempt++) {
                onEvent.accept(new AgentStepEvent("thinking", "Execute Workflow Step " + step.getStepOrder() + ": " + toolName + (attempt > 1 ? "(Retry " + attempt + ")" : ""), toolName, step.getPrompt(), now()));
                try {
                    ToolResult result = tool.execute(new ToolContext(agent.getId(), null, modelConfigId, request.contextRefs() == null ? List.of() : request.contextRefs()), args);
                    String json = result.asJson(objectMapper);
                    if (step.getOutputKey() != null && !step.getOutputKey().isBlank()) outputs.put(step.getOutputKey(), json);
                    onEvent.accept(new AgentStepEvent("step", toolName + " Done", toolName, summarize(json), now(), nodeMap(args), nodeMap(result.output()), result.tokenUsage()));
                    break;
                } catch (Exception ex) {
                    if (attempt >= attempts) {
                        onEvent.accept(new AgentStepEvent("error", toolName + " Failed", toolName, ex.getMessage(), now()));
                        return;
                    }
                }
            }
        }
        onEvent.accept(new AgentStepEvent("done", "Workflow Execution Done. ", null, null, now()));
    }

    private ObjectNode workflowArgs(WorkflowStep step, RunAgentRequest request, Map<String, String> outputs) {
        ObjectNode args = objectMapper.createObjectNode();
        if (step.getInputMapping() != null) {
            step.getInputMapping().forEach((key, value) -> args.set(key, objectMapper.valueToTree(value)));
        }
        String instruction = request.instruction() == null ? "" : request.instruction();
        String joinedOutputs = outputs.isEmpty() ? instruction : instruction + "\n\nUpstream step output: \n" + outputs;
        if (!args.hasNonNull("q") && "literature-search".equals(step.getToolName())) args.put("q", instruction);
        if (!args.hasNonNull("text") && List.of("summarizer", "translator", "classifier").contains(step.getToolName())) args.put("text", joinedOutputs);
        if (!args.hasNonNull("instruction") && step.getPrompt() != null && !step.getPrompt().isBlank()) args.put("instruction", step.getPrompt());
        if (!args.hasNonNull("id") && request.contextRefs() != null) {
            request.contextRefs().stream()
                    .filter(ref -> "paper".equals(String.valueOf(ref.get("type"))) && ref.get("id") != null)
                    .findFirst()
                    .ifPresent(ref -> args.put("id", Long.parseLong(String.valueOf(ref.get("id")))));
        }
        return args;
    }

    private boolean conditionAllows(String condition, Map<String, String> outputs) {
        if (condition == null || condition.isBlank()) return true;
        String trimmed = condition.trim();
        if ("false".equalsIgnoreCase(trimmed)) return false;
        if ("true".equalsIgnoreCase(trimmed)) return true;
        if (trimmed.endsWith("!= null")) {
            String key = trimmed.substring(0, trimmed.length() - "!= null".length()).trim();
            return outputs.containsKey(key) || outputs.keySet().stream().anyMatch(k -> ("steps." + k + ".output").equals(key));
        }
        return true;
    }

    private int retryCount(WorkflowStep step) {
        Object value = step.getRetryPolicy().getOrDefault("maxRetries", 0);
        try { return 1 + Math.max(0, Math.min(5, Integer.parseInt(String.valueOf(value)))); } catch (Exception ex) { return 1; }
    }

    private void executeMockTool(String name, JsonNode args, Set<String> allowedTools, Long modelConfigId, RunAgentRequest request,
                                 Consumer<AgentStepEvent> onEvent, RunPermissionGate permissionGate) {
        if (!allowedTools.contains(name)) return;
        Tool tool = toolRegistry.get(name);
        if (tool.isWriteOperation() && permissionGate != null && !permissionGate.beforeTool(tool, args, affectedCount(args))) return;
        onEvent.accept(new AgentStepEvent("thinking", "Execute " + name, name, null, now()));
        String resultJson = tool.execute(new ToolContext(request.agentId(), null, modelConfigId, request.contextRefs()), args).asJson(objectMapper);
        onEvent.accept(new AgentStepEvent("step", name + " Done", name, summarize(resultJson), now(), nodeMap(args), Map.of("detail", resultJson), Map.of()));
    }

    private JsonNode parseAction(String raw) {
        try {
            String cleaned = raw == null ? "" : raw.trim();
            if (cleaned.startsWith("```")) cleaned = cleaned.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "").trim();
            return objectMapper.readTree(cleaned);
        } catch (Exception ex) {
            return objectMapper.createObjectNode();
        }
    }

    private int affectedCount(JsonNode args) {
        if (args == null) return 1;
        for (String key : List.of("ids", "paperIds", "paths")) if (args.has(key) && args.get(key).isArray()) return args.get(key).size();
        return 1;
    }
    @SuppressWarnings("unchecked")
    private Map<String,Object> nodeMap(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return Map.of();
        if (node.isObject()) return objectMapper.convertValue(node, Map.class);
        return Map.of("value", objectMapper.convertValue(node, Object.class));
    }

    private String summarize(String result) { return truncate(result == null ? "" : result.trim(), 240); }
    private String truncate(String text, int maxChars) { return text == null ? "" : text.length() <= maxChars ? text : text.substring(0, maxChars); }
    private long now() { return System.currentTimeMillis(); }
}
