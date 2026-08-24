package com.kms.ai;

import com.kms.ai.dto.ChatRequest;
import com.kms.ai.dto.ChatResponse;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.paper.Paper;
import com.kms.paper.PaperService;
import com.kms.search.SemanticSearchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    private static final Logger log = LoggerFactory.getLogger(AiController.class);
    /** 按问题检索时取多少个段落。8 段 × ~800 字符 ≈ 6400 字符，和骨架摘录叠加后仍在预算内。 */
    private static final int RETRIEVAL_TOP_K = 8;

    private final OpenAiCompatibleClient llmClient;
    private final PaperService paperService;
    private final SemanticSearchService semanticSearchService;

    public AiController(OpenAiCompatibleClient llmClient, PaperService paperService,
                        SemanticSearchService semanticSearchService) {
        this.llmClient = llmClient;
        this.paperService = paperService;
        this.semanticSearchService = semanticSearchService;
    }

    @PostMapping("/chat")
    public ChatResponse chat(@RequestBody ChatRequest request) {
        String paperText = null;
        String retrieved = null;
        if (request.paperId() != null) {
            Paper paper = paperService.findPaper(request.paperId());
            paperText = paper.getPdfText();
            retrieved = retrieveRelevantPassages(request.paperId(), lastUserMessage(request.messages()));
        }
        List<ChatMessageDto> messages = new java.util.ArrayList<>(request.messages() == null ? List.of() : request.messages());
        String featurePrompt = buildFeaturePrompt(request);
        if (featurePrompt != null && !featurePrompt.isBlank()) {
            messages.add(0, new ChatMessageDto("system", featurePrompt));
        }
        return new ChatResponse(llmClient.chat(messages, paperText, request.context(), retrieved));
    }

    private String buildFeaturePrompt(ChatRequest request) {
        StringBuilder sb = new StringBuilder();
        if (Boolean.TRUE.equals(request.thinking())) {
            sb.append("请将你的深度思考过程放在 <thinking>...</thinking> 标签中，然后在标签外给出最终回答。\n");
            sb.append("思考过程应包含：问题分析、推理步骤、关键考量点。保持简洁但有深度。\n");
        }
        if (Boolean.TRUE.equals(request.webSearch())) {
            sb.append("你具备联网搜索能力。如果问题需要最新信息或实时数据，请说明你需要搜索什么关键词。\n");
        }
        if (request.effort() != null) {
            switch (request.effort()) {
                case "low" -> sb.append("请简洁回答，直击要点，控制在 500 字以内。\n");
                case "high" -> sb.append("请给出详尽、全面的回答，包含充分的分析和细节。\n");
                default -> { }
            }
        }
        return sb.toString();
    }

    private String lastUserMessage(List<ChatMessageDto> messages) {
        if (messages == null) return null;
        for (int i = messages.size() - 1; i >= 0; i--) {
            ChatMessageDto message = messages.get(i);
            if ("user".equalsIgnoreCase(message.role())) return message.content();
        }
        return null;
    }

    /**
     * 按用户这次的问题，从 embedding_chunk 里取最相关的原文段落。
     *
     * 没有它时，模型拿到的只有 SectionExcerpt 的静态章节骨架（开头 + 各章前若干字），
     * 一篇 73000 字符的论文 83% 进不了模型，且与问的是什么无关。
     * 检索失败（没跑过回填 / embedding 模型没配）不应让对话整个失败，
     * 退回原来的纯骨架模式即可，只记一条日志。
     */
    private String retrieveRelevantPassages(Long paperId, String question) {
        if (question == null || question.isBlank()) return null;
        try {
            List<Map<String, Object>> hits = semanticSearchService.searchWithinPaper(question, paperId, RETRIEVAL_TOP_K);
            if (hits.isEmpty()) return null;
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> hit : hits) {
                Object page = hit.get("page");
                sb.append("【p.").append(page == null ? "?" : page).append("】")
                  .append(hit.get("text")).append("\n\n");
            }
            return sb.toString();
        } catch (Exception ex) {
            log.warn("按问题检索段落失败，退回章节骨架模式: paperId={} err={}", paperId, ex.getMessage());
            return null;
        }
    }
}
