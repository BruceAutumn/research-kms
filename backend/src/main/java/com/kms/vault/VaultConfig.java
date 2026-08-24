package com.kms.vault;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Lazy;
import org.springframework.scheduling.annotation.EnableScheduling;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/**
 * Vault Root Dir Config: On startup only ensure root exists. 
 * Backend runs on host, directlyReadwrite localFile System(No Container Boundary), thereforeOneCut
 * follow-upFileoperationMustthrough {@link VaultPathResolver}  Pathtraversal check. 
 */
@Configuration
@EnableScheduling
public class VaultConfig {
    private static final Logger log = LoggerFactory.getLogger(VaultConfig.class);

    public static final List<String> BASE_DIRS = List.of();

    private final String rootDir;

    public VaultConfig(@Value("${kms.vault.root}") String rootDir) {
        this.rootDir = rootDir;
    }

    /**
     * Expose Vault Root Dir(real path). Init root on startup, Init failure throws
     * Block Start -- OnenotAvailable  Vault Root should not be silentRun. 
     */
    @Bean
    @Lazy(false)
    public Path vaultRootPath() {
        try {
            Path root = Path.of(rootDir).toAbsolutePath().normalize();
            Files.createDirectories(root);
            Path realRoot = root.toRealPath();
            log.info("[Vault] root ready: {}", realRoot);
            return realRoot;
        } catch (IOException ex) {
            throw new IllegalStateException("Vault Root Init failed: " + rootDir, ex);
        }
    }
}
