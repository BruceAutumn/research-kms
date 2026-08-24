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
    /** How many segments to retrieve. 8 Segment x ~800 char ~= 6400 char, andskeleton excerpt within budget.  */
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
            sb.append("Put your deep thinking in <thinking>...</thinking> in tag, then atTagoutside give finalAnswer. \n");
            sb.append("Thinking Processshould include: problem analysis, Reasoning Steps, Key Considerations. Stay concise yet deep. \n");
        }
        if (Boolean.TRUE.equals(request.webSearch())) {
            sb.append("you have web search capability. If question needs latest or realtime data, Please state what keywords to search. \n");
        }
        if (request.effort() != null) {
            switch (request.effort()) {
                case "low" -> sb.append("Please answer concisely, To the point, control at 500 chars within. \n");
                case "high" -> sb.append("Please give detailed, Comprehensive answer, With full analysis and detail. \n");
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
     * By user this question, from embedding_chunk take most relevant text in. 
     *
     * when without it, Model only gets SectionExcerpt static chapter skeleton(start + First N chars of each chapter), 
     * Onepaper 73000 charPaper 83% Cannot reach model, andandasked what irrelevant. 
     * retrieveFailed(Never ran backfill / embedding Model not configured)should not letChatwholeFailed, 
     * fall backOriginalraw skeleton modeI.e.Can, only logOnelog entry. 
     */
    private String retrieveRelevantPassages(Long paperId, String question) {
        if (question == null || question.isBlank()) return null;
        try {
            List<Map<String, Object>> hits = semanticSearchService.searchWithinPaper(question, paperId, RETRIEVAL_TOP_K);
            if (hits.isEmpty()) return null;
            StringBuilder sb = new StringBuilder();
            for (Map<String, Object> hit : hits) {
                Object page = hit.get("page");
                sb.append("[p.").append(page == null ? "?" : page).append("]")
                  .append(hit.get("text")).append("\n\n");
            }
            return sb.toString();
        } catch (Exception ex) {
            log.warn("Failed to retrieve segments by question, fall back to chapter skeleton mode: paperId={} err={}", paperId, ex.getMessage());
            return null;
        }
    }
}
