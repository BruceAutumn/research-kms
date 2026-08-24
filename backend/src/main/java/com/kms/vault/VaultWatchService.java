package com.kms.vault;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Vault 外部修改感知：macOS 没有 inotify，JDK WatchService 在 macOS 退化为
 * PollingWatchService（默认间隔可达数秒、且对子目录不递归）。因此本阶段
 * 直接采用「可配置间隔的轮询扫描器」：默认 3s，比较 mtime+size，
 * 变更后增量更新索引并通过 SSE（GET /api/vault/watch）广播。
 * UI 上如实标注「外部修改感知不是即时的」，并提供手动重新扫描按钮。
 */
@Service
public class VaultWatchService {
    private static final Logger log = LoggerFactory.getLogger(VaultWatchService.class);

    private final VaultIndexService indexService;
    private final VaultPathResolver pathResolver;
    private final long intervalMs;
    private final Map<String, String> snapshot = new HashMap<>(); // relPath -> mtime:size
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public VaultWatchService(VaultIndexService indexService, VaultPathResolver pathResolver,
                             @Value("${kms.vault.scan-interval-ms:3000}") long intervalMs) {
        this.indexService = indexService;
        this.pathResolver = pathResolver;
        this.intervalMs = intervalMs;
        log.info("[Vault] 轮询扫描器启动：interval={}ms（macOS WatchService 不递归且延迟大，故采用轮询）", intervalMs);
    }

    public long intervalMs() {
        return intervalMs;
    }

    public long indexedCount() {
        return indexService.indexedCount();
    }

    /** 请求线程写盘并索引后刷新快照，避免扫描器对刚写入的文件重复索引。 */
    public synchronized void refreshStamp(Path realPath) {
        String rel = pathResolver.toRelative(realPath);
        String stamp = realPath.toFile().lastModified() + ":" + realPath.toFile().length();
        snapshot.put(rel, stamp);
    }

    // ------------------------------------------------------------------
    // 轮询扫描
    // ------------------------------------------------------------------

    @Scheduled(fixedDelayString = "${kms.vault.scan-interval-ms:3000}", initialDelayString = "${kms.vault.scan-interval-ms:3000}")
    public void scanTick() {
        try {
            rescan();
        } catch (Exception ex) {
            log.warn("[Vault] 扫描失败: {}", ex.getMessage());
        }
    }

    /** 手动触发一次变更扫描（POST /api/vault/rescan）。返回本次扫描结果。 */
    public synchronized Map<String, Object> rescan() {
        long start = System.currentTimeMillis();
        List<String> changed = new ArrayList<>();
        Map<String, String> current = new HashMap<>();

        List<Path> mdFiles = new ArrayList<>();
        try (var stream = Files.walk(pathResolver.root())) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> !Files.isSymbolicLink(path))
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
                    .forEach(mdFiles::add);
        } catch (IOException ex) {
            throw new IllegalStateException("扫描 Vault 失败", ex);
        }

        for (Path file : mdFiles) {
            String rel = pathResolver.toRelative(file);
            String stamp = file.toFile().lastModified() + ":" + file.toFile().length();
            current.put(rel, stamp);
            String previous = snapshot.get(rel);
            if (previous == null || !previous.equals(stamp)) {
                changed.add(rel);
                try {
                    indexService.indexFile(file);
                } catch (Exception ex) {
                    log.warn("[Vault] 增量索引失败: {} ({})", rel, ex.getMessage());
                }
            }
        }
        for (String rel : new ArrayList<>(snapshot.keySet())) {
            if (!current.containsKey(rel)) {
                changed.add(rel);
                indexService.removeIndex(rel);
            }
        }
        snapshot.clear();
        snapshot.putAll(current);

        long duration = System.currentTimeMillis() - start;
        if (!changed.isEmpty()) {
            log.info("[Vault] 外部变更感知: {} 个文件, 耗时 {}ms → {}", changed.size(), duration, changed);
            broadcast(changed);
        }
        Map<String, Object> result = new java.util.LinkedHashMap<>();
        result.put("scanned", mdFiles.size());
        result.put("changed", changed);
        result.put("durationMs", duration);
        return result;
    }

    // ------------------------------------------------------------------
    // SSE
    // ------------------------------------------------------------------

    public SseEmitter registerEmitter() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        try {
            emitter.send(SseEmitter.event().name("ready").data(Map.of("type", "ready")));
        } catch (IOException ignored) {
        }
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError((error) -> emitters.remove(emitter));
        return emitter;
    }

    private void broadcast(List<String> paths) {
        Map<String, Object> payload = Map.of("type", "changed", "paths", paths);
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event().name("vault-change").data(payload));
            } catch (IOException ex) {
                emitters.remove(emitter);
            }
        }
    }
}
