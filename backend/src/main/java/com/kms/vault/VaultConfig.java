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
 * Vault 根目录配置：启动时只确保根目录存在。
 * 后端跑在宿主机，直接读写本地文件系统（无容器边界），因此一切
 * 后续文件操作必须经过 {@link VaultPathResolver} 的路径穿越校验。
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
     * 暴露 Vault 根目录（real path）。启动即初始化根目录，初始化失败直接抛异常
     * 阻止启动 —— 一个不可用的 Vault Root 不应静默运行。
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
            throw new IllegalStateException("Vault Root 初始化失败: " + rootDir, ex);
        }
    }
}
