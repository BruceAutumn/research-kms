package com.kms.llm.provider;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface LlmProviderRepository extends JpaRepository<LlmProvider, Long> {
    List<LlmProvider> findAllByOrderByNameAsc();
    Optional<LlmProvider> findByNameIgnoreCase(String name);
}
