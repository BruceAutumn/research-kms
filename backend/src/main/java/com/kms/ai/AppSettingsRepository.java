package com.kms.ai;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface AppSettingsRepository extends JpaRepository<AppSettings, Long> {
    Optional<AppSettings> findByUserId(Long userId);
}
