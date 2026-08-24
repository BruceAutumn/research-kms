package com.kms.llm.model;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface LlmModelRepository extends JpaRepository<LlmModel, Long> {
    @Query("select m from LlmModel m join fetch m.provider order by m.defaultModel desc, m.providerId asc, m.displayName asc")
    List<LlmModel> findAllWithProvider();
    List<LlmModel> findByProviderIdOrderByDisplayNameAsc(Long providerId);
    long countByProviderId(Long providerId);
    Optional<LlmModel> findFirstByDefaultModelTrueAndEnabledTrue();
    Optional<LlmModel> findFirstByEnabledTrueOrderByIdAsc();
    Optional<LlmModel> findByLegacyModelConfigId(Long legacyModelConfigId);
    Optional<LlmModel> findFirstByCapabilityAndEnabledTrueOrderByIdAsc(String capability);
    Optional<LlmModel> findFirstByDefaultModelTrueAndEnabledTrueAndCapability(String capability);
    List<LlmModel> findByCapabilityAndEnabledTrueOrderByIdAsc(String capability);

    @Modifying
    @Query("update LlmModel m set m.defaultModel = false")
    int clearDefault();
}
