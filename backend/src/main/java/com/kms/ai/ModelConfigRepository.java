package com.kms.ai;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ModelConfigRepository extends JpaRepository<ModelConfig, Long> {
    List<ModelConfig> findByUserIdOrderByDefaultModelDescUpdatedAtDescIdDesc(Long userId);
    Optional<ModelConfig> findByIdAndUserId(Long id, Long userId);
    Optional<ModelConfig> findFirstByUserIdAndDefaultModelTrue(Long userId);
    Optional<ModelConfig> findFirstByUserIdOrderByIdAsc(Long userId);

    @Modifying
    @Query("update ModelConfig m set m.defaultModel = false where m.userId = :userId")
    int clearDefault(@Param("userId") Long userId);

    @Query("select m from ModelConfig m where m.apiKey is not null and m.apiKey <> '' and (m.apiKeyEnc is null or m.apiKeyEnc = '')")
    List<ModelConfig> findPlaintextPendingEncryption();
}
