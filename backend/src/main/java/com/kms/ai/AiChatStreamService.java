package com.kms.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.ai.dto.ChatStreamRequest;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.llm.client.LlmClientFactory;
import com.kms.llm.client.LlmRequest;
import com.kms.note.Note;
import com.kms.note.NoteRepository;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

@Service
public class AiChatStreamService {
    private final LlmClientFactory llmClientFactory;
    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final PaperRepository paperRepository;
    private final NoteRepository noteRepository;
    private final ObjectMapper objectMapper;
    private final TaskExecutor agentRunExecutor;

    public AiChatStreamService(LlmClientFactory llmClientFactory, AiConversationRepository conversationRepository,
                               AiMessageRepository messageRepository, PaperRepository paperRepository,
                               NoteRepository noteRepository, ObjectMapper objectMapper,
                               @Qualifier("agentRunExecutor") TaskExecutor agentRunExecutor) {
        this.llmClientFactory = llmClientFactory;
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.paperRepository = paperRepository;
        this.noteRepository = noteRepository;
        this.objectMapper = objectMapper;
        this.agentRunExecutor = agentRunExecutor;
    }

    public SseEmitter stream(ChatStreamRequest request) {
        SseEmitter emitter = new SseEmitter(0L);
        AtomicBoolean cancelled = new AtomicBoolean(false);
        emitter.onCompletion(() -> cancelled.set(true));
        emitter.onTimeout(() -> cancelled.set(true));
        emitter.onError(ignored -> cancelled.set(true));
        agentRunExecutor.execute(() -> run(request, emitter, cancelled));
        return emitter;
    }

    private void run(ChatStreamRequest request, SseEmitter emitter, AtomicBoolean cancelled) {
        Instant started = Instant.now();
        StringBuilder assistant = new StringBuilder();
        Long conversationId = null;
        try {
            conversationId = persistUserMessages(request);
            List<ChatMessageDto> messages = new ArrayList<>();
            SourceContext sourceContext = resolveContext(request.contextRefs());
            if (!sourceContext.text().isBlank()) {
                messages.add(new ChatMessageDto("system", "Read-only Context, forbidExecutewrite op. Please based on Literature/Vault Content Answer. \n" +
                        "inAnswerinReferenceContextwhen, Please use [^N] anchorPointmarkSource(N as source number), E.g.: Some conclusion[^1]. \n" +
                        "Source List: \n\n" + sourceContext.text()));
            }
            String featurePrompt = buildFeaturePrompt(request);
            if (featurePrompt != null && !featurePrompt.isBlank()) {
                messages.add(new ChatMessageDto("system", featurePrompt));
            }
            messages.addAll(request.messages() == null ? List.of() : request.messages());
            int maxTokens = resolveMaxTokens(request);
            Long finalConversationId = conversationId;
            llmClientFactory.stream(new LlmRequest(request.modelId(), messages, maxTokens), chunk -> {
                if (cancelled.get()) return;
                assistant.append(chunk.delta());
                send(emitter, "token", Map.of("delta", chunk.delta()));
            });
            if (!cancelled.get()) {
                persistAssistantMessage(finalConversationId, assistant.toString());
                Map<String, Object> donePayload = new LinkedHashMap<>();
                donePayload.put("conversationId", finalConversationId);
                donePayload.put("status", "completed");
                donePayload.put("totalMs", Duration.between(started, Instant.now()).toMillis());
                donePayload.put("sources", sourceContext.sources());
                send(emitter, "done", donePayload);
                emitter.complete();
            }
        } catch (Exception ex) {
            Map<String, Object> payload = errorPayload(ex);
            if (conversationId != null) payload.put("conversationId", conversationId);
            send(emitter, "error", payload);
            emitter.complete();
        }
    }

    @Transactional
    protected Long persistUserMessages(ChatStreamRequest request) {
        AiConversation conversation = request.conversationId() == null
                ? createConversation(request.messages())
                : conversationRepository.findByIdAndUserId(request.conversationId(), CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found."));
        for (ChatMessageDto message : request.messages() == null ? List.<ChatMessageDto>of() : request.messages()) {
            if (!"user".equals(message.role())) continue;
            AiMessage row = new AiMessage();
            row.setConversationId(conversation.getId());
            row.setRole("user");
            row.setContent(message.content() == null ? "" : message.content());
            messageRepository.save(row);
        }
        conversation.setUpdatedAt(OffsetDateTime.now());
        conversationRepository.save(conversation);
        return conversation.getId();
    }

    @Transactional
    protected void persistAssistantMessage(Long conversationId, String content) {
        if (conversationId == null || content == null || content.isBlank()) return;
        AiMessage row = new AiMessage();
        row.setConversationId(conversationId);
        row.setRole("assistant");
        row.setContent(content);
        messageRepository.save(row);
        conversationRepository.findByIdAndUserId(conversationId, CurrentUser.ID).ifPresent(conversation -> {
            conversation.setUpdatedAt(OffsetDateTime.now());
            conversationRepository.save(conversation);
        });
    }

    private AiConversation createConversation(List<ChatMessageDto> messages) {
        String title = messages == null ? "New chat" : messages.stream()
                .filter(message -> "user".equals(message.role()))
                .findFirst()
                .map(message -> truncate(message.content(), 20))
                .orElse("New chat");
        AiConversation conversation = new AiConversation();
        conversation.setUserId(CurrentUser.ID);
        conversation.setTitle(title == null || title.isBlank() ? "New chat" : title);
        return conversationRepository.save(conversation);
    }

    private SourceContext resolveContext(List<Map<String, Object>> refs) {
        if (refs == null || refs.isEmpty()) return new SourceContext("", List.of());
        StringBuilder text = new StringBuilder();
        List<Map<String, Object>> sources = new ArrayList<>();
        int index = 1;
        for (Map<String, Object> ref : refs) {
            String type = String.valueOf(ref.getOrDefault("type", ""));
            Long id = parseLong(ref.get("id"));
            if (id == null) continue;
            if ("paper".equals(type) || "literature".equals(type)) {
                var paper = paperRepository.findByIdAndUserId(id, CurrentUser.ID);
                if (paper.isPresent()) {
                    appendPaper(text, paper.get(), index);
                    sources.add(sourceMap(index, "paper", paper.get().getId(), paper.get().getTitle()));
                    index++;
                }
            }
            if ("note".equals(type) || "vault".equals(type)) {
                var note = noteRepository.findByIdAndUserId(id, CurrentUser.ID);
                if (note.isPresent()) {
                    appendNote(text, note.get(), index);
                    sources.add(sourceMap(index, "note", note.get().getId(), note.get().getTitle()));
                    index++;
                }
            }
        }
        return new SourceContext(truncate(text.toString(), 12000), sources);
    }

    private Map<String, Object> sourceMap(int index, String type, Long id, String title) {
        Map<String, Object> src = new LinkedHashMap<>();
        src.put("index", index);
        src.put("type", type);
        src.put("id", id);
        src.put("title", title != null ? title : "");
        return src;
    }

    private record SourceContext(String text, List<Map<String, Object>> sources) {}

    private void appendPaper(StringBuilder text, Paper paper, int index) {
        text.append("\n[^").append(index).append("] [Paper #").append(paper.getId()).append("] ").append(paper.getTitle()).append('\n');
        if (paper.getAuthors() != null) text.append("Authors: ").append(paper.getAuthors()).append('\n');
        if (paper.getAbstractText() != null) text.append("Abstract: ").append(paper.getAbstractText()).append('\n');
        if (paper.getPdfText() != null) text.append(truncate(paper.getPdfText(), 5000)).append('\n');
    }

    private void appendNote(StringBuilder text, Note note, int index) {
        text.append("\n[^").append(index).append("] [Vault Note #").append(note.getId()).append("] ").append(note.getTitle()).append('\n');
        text.append(truncate(note.getContent(), 5000)).append('\n');
    }

    private Long parseLong(Object value) {
        try {
            return value == null ? null : Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Map<String, Object> errorPayload(Exception ex) {
        int status = ex instanceof ApiException apiException ? apiException.getStatus().value() : 500;
        String message = ex.getMessage() == null || ex.getMessage().isBlank() ? "Chat stream failed." : ex.getMessage();
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("code", ex instanceof ApiException ? "HTTP_" + status : "CHAT_STREAM_FAILED");
        payload.put("httpStatus", status);
        payload.put("message", message);
        payload.put("requestId", UUID.randomUUID().toString());
        return payload;
    }

    private String buildFeaturePrompt(ChatStreamRequest request) {
        StringBuilder sb = new StringBuilder();
        if (Boolean.TRUE.equals(request.thinking())) {
            sb.append("Put your deep thinking in <thinking>...</thinking> in tag, then atTagoutside give finalAnswer. \n");
            sb.append("Thinking Processshould include: problem analysis, Reasoning Steps, Key Considerations. Stay concise yet deep. \n");
        }
        if (Boolean.TRUE.equals(request.webSearch())) {
            sb.append("you have web search capability. If question needs latest info, realtimeDataor you notOKfact, \n");
            sb.append("State keywords before answering, then based onYourknowledge give bestAnswer, \n");
            sb.append("and mark parts needing user time-validity check. \n");
        }
        if (request.effort() != null) {
            switch (request.effort()) {
                case "low" -> sb.append("Please answer concisely, To the point, control at 500 chars within. \n");
                case "high" -> sb.append("Please give detailed, Comprehensive answer, With full analysis, Examples and details. \n");
                default -> { }
            }
        }
        return sb.toString();
    }

    private int resolveMaxTokens(ChatStreamRequest request) {
        if (request.effort() != null) {
            return switch (request.effort()) {
                case "low" -> 2048;
                case "high" -> 8192;
                default -> 4096;
            };
        }
        return 4096;
    }

    private void send(SseEmitter emitter, String event, Object data) {
        try {
            emitter.send(SseEmitter.event().name(event).data(objectMapper.writeValueAsString(data)));
        } catch (IOException ex) {
            emitter.completeWithError(ex);
        }
    }

    private String truncate(String text, int maxChars) {
        if (text == null) return "";
        return text.length() <= maxChars ? text : text.substring(0, maxChars);
    }
}
