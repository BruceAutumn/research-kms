package com.kms.ai;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Component
public class ApiKeyEncryptionMigrator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(ApiKeyEncryptionMigrator.class);

    private final ModelConfigRepository repository;
    private final AppSettingsRepository appSettingsRepository;
    private final ApiKeyCipher cipher;

    public ApiKeyEncryptionMigrator(ModelConfigRepository repository, AppSettingsRepository appSettingsRepository, ApiKeyCipher cipher) {
        this.repository = repository;
        this.appSettingsRepository = appSettingsRepository;
        this.cipher = cipher;
    }

    @Override
    @Transactional
    public void run(ApplicationArguments args) {
        List<ModelConfig> rows = repository.findPlaintextPendingEncryption();
        int migrated = 0;
        for (ModelConfig row : rows) {
            String plain = row.getApiKey();
            String encrypted = cipher.encrypt(plain);
            String roundTrip = cipher.decrypt(encrypted);
            if (!plain.equals(roundTrip)) {
                throw new IllegalStateException("API Key Encryption migration roundtrip failed, Start aborted. ");
            }
            row.setApiKeyEnc(encrypted);
            row.setApiKey(null);
            repository.save(row);
            migrated++;
        }
        int clearedLegacyRows = 0;
        for (AppSettings settings : appSettingsRepository.findAll()) {
            if (settings.getApiKey() != null && !settings.getApiKey().isBlank()) {
                settings.setApiKey(null);
                appSettingsRepository.save(settings);
                clearedLegacyRows++;
            }
        }
        log.info("API Key Encryption migration done: {}  ; Old app_settings plaintextFieldClean: {}  ; Decryption roundtrip consistent. ", migrated, clearedLegacyRows);
    }
}
