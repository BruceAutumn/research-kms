package com.kms.ai;

import com.kms.ai.dto.AiConversationSummaryDto;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface AiConversationRepository extends JpaRepository<AiConversation, Long> {
    Optional<AiConversation> findByIdAndUserId(Long id, Long userId);

    @Query("""
            select new com.kms.ai.dto.AiConversationSummaryDto(c.id, c.title, c.updatedAt, count(m.id))
            from AiConversation c
            left join AiMessage m on m.conversationId = c.id
            where c.userId = :userId
            group by c.id, c.title, c.updatedAt
            order by c.updatedAt desc, c.id desc
            """)
    List<AiConversationSummaryDto> listSummaries(@Param("userId") Long userId);
}
