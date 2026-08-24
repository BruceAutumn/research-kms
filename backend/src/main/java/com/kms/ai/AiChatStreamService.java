package com.kms.ai;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.ai.dto.ChatAttachmentDto;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.ai.dto.ChatStreamRequest;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.llm.client.LlmClientFactory;
import com.kms.llm.client.LlmRequest;
import com.kms.note.NoteService;
import com.kms.note.Note;
import com.kms.note.NoteRepository;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.core.task.TaskExecutor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

@Service
public class AiChatStreamService {
    private static final long MAX_ATTACHMENT_BYTES = 10L * 1024L * 1024L;
    private static final int MAX_ATTACHMENT_CHARS = 12000;
    private static final Set<String> SUPPORTED_ATTACHMENT_EXTENSIONS = Set.of(
            "txt", "md", "markdown", "json", "csv", "pdf", "png", "jpg", "jpeg"
    );
    private static final Pattern INVALID_FILE_CHARS = Pattern.compile("[\\\\/:*?\"<>|\\p{Cntrl}]");

    private final LlmClientFactory llmClientFactory;
    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;
    private final PaperRepository paperRepository;
    private final NoteRepository noteRepository;
    private final NoteService noteService;
    private final ObjectMapper objectMapper;
    private final TaskExecutor agentRunExecutor;
    private final Path attachmentRoot;

    public AiChatStreamService(LlmClientFactory llmClientFactory, AiConversationRepository conversationRepository,
                               AiMessageRepository messageRepository, PaperRepository paperRepository,
                               NoteRepository noteRepository, NoteService noteService, ObjectMapper objectMapper,
                               @Qualifier("agentRunExecutor") TaskExecutor agentRunExecutor) {
        this.llmClientFactory = llmClientFactory;
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
        this.paperRepository = paperRepository;
        this.noteRepository = noteRepository;
        this.noteService = noteService;
        this.objectMapper = objectMapper;
        this.agentRunExecutor = agentRunExecutor;
        this.attachmentRoot = Path.of(System.getProperty("java.io.tmpdir"), "research-kms-ai-attachments")
                .toAbsolutePath()
                .normalize();
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
            SourceContext sourceContext = resolveContext(request.contextRefs(), request.attachments());
            if (!sourceContext.text().isBlank()) {
                messages.add(new ChatMessageDto("system", "只读上下文，禁止执行写操作。请基于以下 Literature/Vault 内容回答。\n" +
                        "在回答中引用上下文时，请使用 [^N] 锚点标记来源（N 为来源编号），例如：某结论[^1]。\n" +
                        "来源列表：\n\n" + sourceContext.text()));
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
        } finally {
            cleanupAttachments(request == null ? null : request.attachments());
        }
    }

    public Map<String, Object> storeAttachment(MultipartFile file) {
        String originalName = safeOriginalName(file.getOriginalFilename());
        String extension = extensionOf(originalName);
        if (!SUPPORTED_ATTACHMENT_EXTENSIONS.contains(extension)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "不支持的附件类型。");
        }
        if (file.getSize() > MAX_ATTACHMENT_BYTES) {
            throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "附件超过 10MB。");
        }
        try {
            Files.createDirectories(attachmentRoot);
            Path saved = attachmentRoot.resolve(UUID.randomUUID() + "_" + originalName).normalize();
            if (!saved.startsWith(attachmentRoot)) {
                throw new ApiException(HttpStatus.BAD_REQUEST, "附件文件名不合法。");
            }
            file.transferTo(saved.toFile());
            Map<String, Object> result = new LinkedHashMap<>();
            // Return an opaque file token, never an absolute server filesystem path.
            result.put("path", saved.getFileName().toString());
            result.put("name", originalName);
            result.put("size", file.getSize());
            result.put("contentType", file.getContentType());
            return result;
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "文件上传失败。");
        }
    }

    public Map<String, Object> deleteAttachment(String path) {
        Path real = resolveAttachmentPath(path);
        try {
            boolean deleted = Files.deleteIfExists(real);
            return Map.of("deleted", deleted);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "附件删除失败。");
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

    private SourceContext resolveContext(List<Map<String, Object>> refs, List<ChatAttachmentDto> attachments) {
        if ((refs == null || refs.isEmpty()) && (attachments == null || attachments.isEmpty())) {
            return new SourceContext("", List.of());
        }
        StringBuilder text = new StringBuilder();
        List<Map<String, Object>> sources = new ArrayList<>();
        int index = 1;
        for (Map<String, Object> ref : refs == null ? List.<Map<String, Object>>of() : refs) {
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
        for (ChatAttachmentDto attachment : attachments == null ? List.<ChatAttachmentDto>of() : attachments) {
            AttachmentContext attachmentContext = readAttachmentContext(attachment);
            text.append("\n[^").append(index).append("] [Attachment] ")
                    .append(attachmentContext.name()).append('\n')
                    .append(attachmentContext.text()).append('\n');
            sources.add(sourceMap(index, "attachment", null, attachmentContext.name()));
            index++;
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
        text.append(truncate(noteService.getContent(note.getId()), 5000)).append('\n');
    }

    private AttachmentContext readAttachmentContext(ChatAttachmentDto attachment) {
        if (attachment == null || attachment.path() == null || attachment.path().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件路径不能为空。");
        }
        Path real = resolveAttachmentPath(attachment.path());
        String name = safeOriginalName(attachment.name());
        String extension = extensionOf(name);
        if (!SUPPORTED_ATTACHMENT_EXTENSIONS.contains(extension)) {
            throw new ApiException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "不支持的附件类型。");
        }
        try {
            long bytes = Files.size(real);
            if (bytes > MAX_ATTACHMENT_BYTES) {
                throw new ApiException(HttpStatus.PAYLOAD_TOO_LARGE, "附件超过 10MB。");
            }
            if ("pdf".equals(extension)) {
                try (PDDocument document = Loader.loadPDF(real.toFile())) {
                    PDFTextStripper stripper = new PDFTextStripper();
                    return new AttachmentContext(name, truncate(stripper.getText(document), MAX_ATTACHMENT_CHARS));
                }
            }
            if (Set.of("png", "jpg", "jpeg").contains(extension)) {
                String text = "图片附件已上传，但当前聊天通道不支持视觉解析。文件名: " + name + ", size=" + bytes + " bytes.";
                return new AttachmentContext(name, text);
            }
            String content = Files.readString(real, StandardCharsets.UTF_8);
            return new AttachmentContext(name, truncate(content, MAX_ATTACHMENT_CHARS));
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件读取失败。");
        }
    }

    private Path resolveAttachmentPath(String rawPath) {
        if (rawPath == null || rawPath.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件令牌不能为空。");
        }
        Path token = Path.of(rawPath);
        if (token.isAbsolute() || token.getNameCount() != 1 || rawPath.contains("/") || rawPath.contains("\\")) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件令牌不合法。");
        }
        Path real = attachmentRoot.resolve(token).toAbsolutePath().normalize();
        if (!real.startsWith(attachmentRoot) || !Files.isRegularFile(real)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "附件路径不合法。");
        }
        return real;
    }

    private void cleanupAttachments(List<ChatAttachmentDto> attachments) {
        if (attachments == null || attachments.isEmpty()) return;
        for (ChatAttachmentDto attachment : attachments) {
            if (attachment == null || attachment.path() == null) continue;
            try {
                Files.deleteIfExists(resolveAttachmentPath(attachment.path()));
            } catch (Exception ignored) {
            }
        }
    }

    private String safeOriginalName(String rawName) {
        String name = rawName == null || rawName.isBlank() ? "upload" : rawName.replace('\\', '/');
        int slash = name.lastIndexOf('/');
        if (slash >= 0) name = name.substring(slash + 1);
        name = INVALID_FILE_CHARS.matcher(name).replaceAll("_").trim();
        if (name.isBlank() || ".".equals(name) || "..".equals(name)) {
            return "upload";
        }
        return name.length() > 160 ? name.substring(0, 160) : name;
    }

    private String extensionOf(String name) {
        int dot = name == null ? -1 : name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) return "";
        return name.substring(dot + 1).toLowerCase(Locale.ROOT);
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
            sb.append("请将你的深度思考过程放在 <thinking>...</thinking> 标签中，然后在标签外给出最终回答。\n");
            sb.append("思考过程应包含：问题分析、推理步骤、关键考量点。保持简洁但有深度。\n");
        }
        if (Boolean.TRUE.equals(request.webSearch())) {
            sb.append("你具备联网搜索能力。如果问题需要最新信息、实时数据或你不确定的事实，\n");
            sb.append("请在回答前说明你需要搜索什么关键词，然后基于你的知识给出最佳回答，\n");
            sb.append("并标注哪些部分可能需要用户自行验证时效性。\n");
        }
        if (request.effort() != null) {
            switch (request.effort()) {
                case "low" -> sb.append("请简洁回答，直击要点，控制在 500 字以内。\n");
                case "high" -> sb.append("请给出详尽、全面的回答，包含充分的分析、示例和细节。\n");
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

    private record AttachmentContext(String name, String text) {}
}
