package com.kms.agent;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.agent.dto.AgentStepEvent;
import com.kms.agent.dto.RunAgentRequest;
import com.kms.agent.dto.RunDtos;
import com.kms.common.ApiException;
import com.kms.llm.model.LlmModelService;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Supplier;

@Service
public class AgentRunService {
    private final AgentRunRepository runRepository;
    private final AgentRunStepRepository stepRepository;
    private final AgentRunner runner;
    private final AgentService agentService;
    private final AgentRepository agentRepository;
    private final LlmModelService llmModelService;
    private final ObjectMapper objectMapper;
    private final ApplicationEventPublisher eventPublisher;
    private final TransactionTemplate newTransaction;
    private final ScheduledExecutorService sseHeartbeatExecutor;
    private final Map<Long, List<RunEmitter>> emitters = new ConcurrentHashMap<>();
    private final Map<Long, CompletableFuture<PermissionDecision>> pendingPermissions = new ConcurrentHashMap<>();
    private final Set<Long> cancelledRuns = ConcurrentHashMap.newKeySet();

    public AgentRunService(AgentRunRepository runRepository, AgentRunStepRepository stepRepository, AgentRunner runner,
                           AgentService agentService, AgentRepository agentRepository, LlmModelService llmModelService,
                           ObjectMapper objectMapper, ApplicationEventPublisher eventPublisher,
                           PlatformTransactionManager transactionManager, ScheduledExecutorService sseHeartbeatExecutor) {
        this.runRepository = runRepository;
        this.stepRepository = stepRepository;
        this.runner = runner;
        this.agentService = agentService;
        this.agentRepository = agentRepository;
        this.llmModelService = llmModelService;
        this.objectMapper = objectMapper;
        this.eventPublisher = eventPublisher;
        this.newTransaction = new TransactionTemplate(transactionManager);
        this.newTransaction.setPropagationBehavior(TransactionTemplate.PROPAGATION_REQUIRES_NEW);
        this.sseHeartbeatExecutor = sseHeartbeatExecutor;
    }

    @Transactional
    public Long create(RunAgentRequest request) {
        Long llmModelId = request.llmModelId();
        if (llmModelId == null && request.modelConfigId() != null) {
            llmModelId = llmModelService.resolveIdForLegacyModelConfig(request.modelConfigId());
        }
        RunAgentRequest normalized = request.withLlmModelId(llmModelId);
        AgentRun run = new AgentRun();
        run.setAgentId(normalized.agentId());
        run.setStatus("RUNNING");
        run.setInput(normalized.instruction());
        run.setContextRefs(normalized.contextRefs());
        run.setModelConfigId(normalized.modelConfigId());
        run.setLlmModelId(normalized.llmModelId());
        AgentRun saved = runRepository.save(run);
        eventPublisher.publishEvent(new RunCreatedEvent(saved.getId(), normalized));
        return saved.getId();
    }

    @Async("agentRunExecutor")
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onRunCreated(RunCreatedEvent event) {
        execute(event.runId(), event.request());
    }

    private void execute(Long runId, RunAgentRequest request) {
        try {
            if (isCancellationRequested(runId)) return;
            persistEvent(runId, "run.started", "RUNNING", null, "Run started", Map.of(), Map.of(), null);
            runner.run(request,
                    event -> {
                        if (!isCancellationRequested(runId)) persistLegacyEvent(runId, event);
                    },
                    (tool, args, affectedCount) -> handlePermission(runId, request.agentId(), tool, args, affectedCount),
                    () -> isCancellationRequested(runId));
            String status = inNewTransaction(() -> runRepository.findById(runId).map(AgentRun::getStatus).orElse(null));
            if ("RUNNING".equals(status)) {
                finishRun(runId, "COMPLETED", null);
                persistEvent(runId, "run.completed", "COMPLETED", null, "Run completed", Map.of(), Map.of(), null);
            }
        } catch (Exception ex) {
            if (!isCancellationRequested(runId)) failRun(runId, ex);
        } finally {
            cancelledRuns.remove(runId);
        }
    }

    private boolean handlePermission(Long runId, Long agentId, Tool tool, JsonNode args, int affectedCount) {
        if (isCancellationRequested(runId)) return false;
        Agent agent = agentId == null ? null : agentService.find(agentId);
        PermissionKey permissionKey = resolvePermissionKey(tool, args);
        String decision = permissionDecision(agent, permissionKey);
        boolean forceConfirm = affectedCount > 20;
        if ("Deny".equalsIgnoreCase(decision)) {
            persistEvent(runId, "permission.required", "DENIED", tool.name(), "权限策略为 Deny，已拒绝执行。", jsonMap(args), Map.of("permissionKey", permissionKey.name(), "affectedCount", affectedCount), "denied");
            return false;
        }
        if (!forceConfirm && "Allow".equalsIgnoreCase(decision)) {
            return true;
        }
        String message = (forceConfirm ? "批量修改超过 20 条，强制确认：" : "Agent 请求权限确认：") + tool.displayName();
        persistEvent(runId, "permission.required", "WAITING", tool.name(), message, jsonMap(args), Map.of("permissionKey", permissionKey.name(), "affectedCount", affectedCount), null);
        CompletableFuture<PermissionDecision> future = new CompletableFuture<>();
        pendingPermissions.put(runId, future);
        try {
            PermissionDecision answer = future.get(10, TimeUnit.MINUTES);
            if (isCancellationRequested(runId)) return false;
            if (answer.alwaysAllow() && agent != null && answer.allow()) {
                Map<String, Object> permissions = new LinkedHashMap<>(agent.getPermissions());
                permissions.put(permissionKey.name(), "Allow");
                agent.setPermissions(permissions);
                inNewTransaction(() -> {
                    agentRepository.save(agent);
                    return null;
                });
            }
            persistEvent(runId, answer.allow() ? "permission.granted" : "permission.denied",
                    answer.allow() ? "RUNNING" : "DENIED", tool.name(), answer.allow() ? "用户允许本次执行。" : "用户拒绝本次执行。", Map.of(), Map.of(), answer.allow() ? null : "denied");
            return answer.allow();
        } catch (TimeoutException ex) {
            markRunPaused(runId, "permission timeout");
            persistEvent(runId, "permission.required", "PAUSED", tool.name(), "10 分钟未响应，运行已暂停。", Map.of(), Map.of(), "permission timeout");
            return false;
        } catch (Exception ex) {
            return false;
        } finally {
            pendingPermissions.remove(runId);
        }
    }

    public Map<String, Object> permission(Long runId, RunDtos.PermissionRequest request) {
        CompletableFuture<PermissionDecision> future = pendingPermissions.get(runId);
        if (future == null) {
            return Map.of("accepted", false, "message", "当前 run 没有等待中的权限请求。");
        }
        future.complete(new PermissionDecision(Boolean.TRUE.equals(request.allow()), Boolean.TRUE.equals(request.alwaysAllow())));
        return Map.of("accepted", true);
    }

    public void cancel(Long runId) {
        AgentRun run = getRun(runId);
        if (isTerminal(run.getStatus())) return;
        cancelledRuns.add(runId);
        CompletableFuture<PermissionDecision> pending = pendingPermissions.get(runId);
        if (pending != null) pending.complete(new PermissionDecision(false, false));
        finishRun(runId, "CANCELLED", "cancelled by user");
        persistEvent(runId, "run.failed", "CANCELLED", null, "Run cancelled", Map.of(), Map.of(), "cancelled");
    }

    private boolean isCancellationRequested(Long runId) {
        if (cancelledRuns.contains(runId)) return true;
        return inNewTransaction(() -> runRepository.findById(runId)
                .map(run -> "CANCELLED".equals(run.getStatus()))
                .orElse(true));
    }

    public SseEmitter stream(Long runId) {
        ensureRunExists(runId);
        SseEmitter emitter = new SseEmitter(0L);
        RunEmitter registered = new RunEmitter(runId, emitter);
        emitter.onCompletion(() -> removeEmitter(runId, registered));
        emitter.onTimeout(() -> removeEmitter(runId, registered));
        emitter.onError(ignored -> removeEmitter(runId, registered));
        startHeartbeat(registered);

        List<AgentRunStep> initialSteps = stepRepository.findByAgentRunIdOrderByIdAsc(runId);
        Long lastStepId = null;
        for (AgentRunStep step : initialSteps) {
            send(registered, toStepDto(step));
            lastStepId = step.getId();
        }

        AgentRun run = getRun(runId);
        if (isTerminal(run.getStatus())) {
            sendTerminal(registered, run.getStatus(), run.getError());
            completeEmitter(registered);
        } else {
            emitters.computeIfAbsent(runId, ignored -> new CopyOnWriteArrayList<>()).add(registered);
            Long finalLastStepId = lastStepId;
            stepRepository.findByAgentRunIdOrderByIdAsc(runId).stream()
                    .filter(step -> finalLastStepId == null || step.getId() > finalLastStepId)
                    .forEach(step -> send(registered, toStepDto(step)));
            AgentRun current = getRun(runId);
            if (isTerminal(current.getStatus())) {
                sendTerminal(registered, current.getStatus(), current.getError());
                completeEmitter(registered);
            }
        }
        return emitter;
    }

    public List<RunDtos.RunDto> history(boolean includeSteps) {
        return runRepository.findTop100ByOrderByStartedAtDescIdDesc().stream().map(run -> toRunDto(run, includeSteps)).toList();
    }

    public RunDtos.RunDto detail(Long runId) {
        return toRunDto(runRepository.findById(runId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Run not found.")), true);
    }

    @Transactional
    public Map<String, Object> deleteHistory(String status, LocalDate beforeDate) {
        String normalizedStatus = status == null || status.isBlank() ? null : status.trim().toUpperCase();
        OffsetDateTime before = beforeDate == null ? null : beforeDate.plusDays(1).atStartOfDay().atOffset(ZoneOffset.UTC);
        if (normalizedStatus == null && before == null) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "Provide status or before date.");
        }
        List<Long> runIds = runRepository.findAll().stream()
                .filter(run -> normalizedStatus == null || normalizedStatus.equalsIgnoreCase(run.getStatus()))
                .filter(run -> before == null || run.getStartedAt() != null && run.getStartedAt().isBefore(before))
                .map(AgentRun::getId)
                .toList();
        if (runIds.isEmpty()) {
            return Map.of("runsDeleted", 0, "stepsDeleted", 0);
        }
        long steps = stepRepository.countByAgentRunIdIn(runIds);
        stepRepository.deleteByAgentRunIdIn(runIds);
        runRepository.deleteAllByIdInBatch(runIds);
        return Map.of("runsDeleted", runIds.size(), "stepsDeleted", steps);
    }

    private void persistLegacyEvent(Long runId, AgentStepEvent event) {
        if (isCancellationRequested(runId)) return;
        String type = switch (event.type()) {
            case "thinking" -> "step.started";
            case "step" -> "step.completed";
            case "done" -> "run.completed";
            case "error" -> "run.failed";
            default -> event.type();
        };
        String status = switch (event.type()) {
            case "thinking" -> "RUNNING";
            case "step" -> "COMPLETED";
            case "done" -> "COMPLETED";
            case "error" -> "FAILED";
            default -> "RUNNING";
        };
        Map<String,Object> input = event.input() == null ? Map.of() : event.input();
        Map<String,Object> output = event.output() == null ? Map.of() : event.output();
        if (output.isEmpty() && event.detail() != null) output = Map.of("detail", event.detail());
        if ("done".equals(event.type())) finishRun(runId, "COMPLETED", null);
        if ("error".equals(event.type())) finishRun(runId, "FAILED", event.message());
        persistEvent(runId, type, status, event.tool(), event.message(), input, output, "error".equals(event.type()) ? event.detail() : null,
                event.tokenUsage() == null ? Map.of() : event.tokenUsage());
    }

    private AgentRunStep persistEvent(Long runId, String eventType, String status, String toolName, String message,
                                      Map<String,Object> input, Map<String,Object> output, String error) {
        return persistEvent(runId, eventType, status, toolName, message, input, output, error, Map.of());
    }

    private AgentRunStep persistEvent(Long runId, String eventType, String status, String toolName, String message,
                                      Map<String,Object> input, Map<String,Object> output, String error,
                                      Map<String,Object> tokenUsage) {
        AgentRunStep saved = inNewTransaction(() -> {
            AgentRunStep step = new AgentRunStep();
            step.setAgentRunId(runId);
            step.setStepOrder((int) stepRepository.countByAgentRunId(runId) + 1);
            step.setEventType(eventType);
            step.setStatus(status);
            step.setToolName(toolName);
            step.setMessage(message);
            step.setInput(input);
            step.setOutput(output);
            step.setError(error);
            step.setTokenUsage(tokenUsage);
            return stepRepository.save(step);
        });
        broadcast(runId, toStepDto(saved));
        return saved;
    }

    private void finishRun(Long runId, String status, String error) {
        inNewTransaction(() -> {
            AgentRun run = getRun(runId);
            // 取消是用户的最终决定，迟到的 LLM/Tool 完成事件不得把它覆盖回 COMPLETED/FAILED。
            if ("CANCELLED".equals(run.getStatus()) && !"CANCELLED".equals(status)) return null;
            run.setStatus(status);
            run.setError(error);
            run.setFinishedAt(OffsetDateTime.now());
            runRepository.save(run);
            return null;
        });
    }

    private void markRunPaused(Long runId, String error) {
        inNewTransaction(() -> {
            AgentRun run = getRun(runId);
            run.setStatus("PAUSED");
            run.setError(error);
            runRepository.save(run);
            return null;
        });
    }

    private void failRun(Long runId, Exception ex) {
        ErrorEnvelope error = toErrorEnvelope(ex);
        finishRun(runId, "FAILED", error.message());
        persistEvent(runId, "run.failed", "FAILED", null, error.message(), Map.of(), error.asMap(), error.message());
    }

    private void broadcast(Long runId, RunDtos.RunStepDto dto) {
        List<RunEmitter> list = emitters.getOrDefault(runId, List.of());
        List<RunEmitter> dead = new ArrayList<>();
        for (RunEmitter emitter : list) {
            if (!send(emitter, dto)) {
                dead.add(emitter);
                continue;
            }
            // 单个 Tool step 也会使用 COMPLETED 状态；只有 run.* 终态事件才能关闭整条 SSE。
            if (isRunTerminalEvent(dto.eventType())) {
                sendTerminal(emitter, dto.status(), dto.error());
                completeEmitter(emitter);
                dead.add(emitter);
            }
        }
        if (!dead.isEmpty()) list.removeAll(dead);
    }

    private boolean send(RunEmitter registered, RunDtos.RunStepDto dto) {
        return sendEvent(registered, dto.eventType(), dto);
    }

    private boolean sendTerminal(RunEmitter registered, String status, String error) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("runId", registered.runId);
        payload.put("status", status);
        if (error != null && !error.isBlank()) payload.put("message", error);
        if ("FAILED".equals(status)) {
            payload.putIfAbsent("code", "RUN_FAILED");
            payload.putIfAbsent("httpStatus", 500);
            payload.putIfAbsent("requestId", UUID.randomUUID().toString());
        }
        return sendEvent(registered, "FAILED".equals(status) ? "error" : "done", payload);
    }

    private boolean sendEvent(RunEmitter registered, String eventName, Object payload) {
        try {
            registered.emitter.send(SseEmitter.event().name(eventName).data(objectMapper.writeValueAsString(payload)));
            return true;
        } catch (IOException ex) {
            return false;
        }
    }

    private void startHeartbeat(RunEmitter registered) {
        registered.heartbeat = sseHeartbeatExecutor.scheduleAtFixedRate(() -> {
            try {
                registered.emitter.send(SseEmitter.event().comment("ping"));
            } catch (IOException ex) {
                completeEmitter(registered);
            }
        }, 15, 15, TimeUnit.SECONDS);
    }

    private void completeEmitter(RunEmitter registered) {
        removeEmitter(registered.runId, registered);
        try {
            registered.emitter.complete();
        } catch (IllegalStateException ignored) {
        }
    }

    private void removeEmitter(Long runId, RunEmitter registered) {
        if (registered.heartbeat != null) {
            registered.heartbeat.cancel(false);
        }
        List<RunEmitter> list = emitters.get(runId);
        if (list != null) list.remove(registered);
    }

    private RunDtos.RunDto toRunDto(AgentRun run, boolean includeSteps) {
        List<RunDtos.RunStepDto> steps = includeSteps ? stepRepository.findByAgentRunIdOrderByIdAsc(run.getId()).stream().map(this::toStepDto).toList() : List.of();
        return new RunDtos.RunDto(run.getId(), run.getAgentId(), run.getStatus(), run.getInput(), run.getContextRefs(), run.getModelConfigId(), run.getLlmModelId(), run.getStartedAt(), run.getFinishedAt(), run.getTokenUsage(), run.getError(), steps);
    }

    private RunDtos.RunStepDto toStepDto(AgentRunStep s) {
        return new RunDtos.RunStepDto(s.getId(), s.getAgentRunId(), s.getStepOrder(), s.getToolName(), s.getEventType(), s.getStatus(), s.getMessage(), s.getInput(), s.getOutput(), s.getError(), s.getDurationMs(), s.getTokenUsage(), s.getCreatedAt());
    }

    private AgentRun getRun(Long runId) {
        return runRepository.findById(runId).orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Run not found."));
    }

    private void ensureRunExists(Long runId) {
        if (!runRepository.existsById(runId)) throw new ApiException(HttpStatus.NOT_FOUND, "Run not found.");
    }

    private <T> T inNewTransaction(Supplier<T> supplier) {
        return newTransaction.execute(ignored -> supplier.get());
    }

    private ErrorEnvelope toErrorEnvelope(Exception ex) {
        int httpStatus = ex instanceof ApiException apiException ? apiException.getStatus().value() : 500;
        String code = ex instanceof ApiException ? "HTTP_" + httpStatus : "RUN_FAILED";
        String message = ex.getMessage() == null || ex.getMessage().isBlank() ? "Run failed." : ex.getMessage();
        return new ErrorEnvelope(code, httpStatus, message, UUID.randomUUID().toString());
    }

    private boolean isTerminal(String status) { return List.of("COMPLETED", "FAILED", "CANCELLED").contains(status); }
    private boolean isRunTerminalEvent(String eventType) {
        return "run.completed".equals(eventType) || "run.failed".equals(eventType);
    }
    private PermissionKey resolvePermissionKey(Tool tool, JsonNode args) {
        if ("note-writer".equals(tool.name()) && args != null && args.hasNonNull("path") && !args.path("path").asText("").isBlank()) {
            return PermissionKey.MODIFY_NOTE;
        }
        return tool.permissionKey();
    }
    private String permissionDecision(Agent agent, PermissionKey key) { return agent == null ? "Ask" : String.valueOf(agent.getPermissions().getOrDefault(key.name(), "Ask")); }
    private Map<String,Object> jsonMap(JsonNode node) { return node == null || node.isMissingNode() ? Map.of() : objectMapper.convertValue(node, new TypeReference<>() {}); }
    private record PermissionDecision(boolean allow, boolean alwaysAllow) {}
    private static final class RunEmitter {
        private final Long runId;
        private final SseEmitter emitter;
        private ScheduledFuture<?> heartbeat;

        private RunEmitter(Long runId, SseEmitter emitter) {
            this.runId = runId;
            this.emitter = emitter;
        }
    }
    private record ErrorEnvelope(String code, int httpStatus, String message, String requestId) {
        private Map<String, Object> asMap() {
            return Map.of("code", code, "httpStatus", httpStatus, "message", message, "requestId", requestId);
        }
    }
}
