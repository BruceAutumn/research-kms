package com.kms.ai;

import com.kms.ai.dto.AiConversationDetailDto;
import com.kms.ai.dto.AiConversationSummaryDto;
import com.kms.ai.dto.ChatMessageDto;
import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ai/conversations")
public class AiConversationController {
    private final AiConversationRepository conversationRepository;
    private final AiMessageRepository messageRepository;

    public AiConversationController(AiConversationRepository conversationRepository, AiMessageRepository messageRepository) {
        this.conversationRepository = conversationRepository;
        this.messageRepository = messageRepository;
    }

    @GetMapping
    public List<AiConversationSummaryDto> list() {
        return conversationRepository.listSummaries(CurrentUser.ID);
    }

    @GetMapping("/{id}")
    public AiConversationDetailDto detail(@PathVariable Long id) {
        AiConversation conversation = conversationRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found."));
        List<ChatMessageDto> messages = messageRepository.findByConversationIdOrderByIdAsc(id).stream()
                .map(message -> new ChatMessageDto(message.getRole(), message.getContent()))
                .toList();
        return new AiConversationDetailDto(
                conversation.getId(),
                conversation.getTitle(),
                conversation.getUpdatedAt(),
                (long) messages.size(),
                messages
        );
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        AiConversation conversation = conversationRepository.findByIdAndUserId(id, CurrentUser.ID)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Conversation not found."));
        conversationRepository.delete(conversation);
    }
}
