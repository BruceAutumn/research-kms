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
 * Vault External change awareness: macOS no inotify, JDK WatchService in macOS Degrade to
 * PollingWatchService(Default interval can be seconds, andTosubDirectorynotRecursive). thus this phaseSegment
 * directly adopt"Configurable interval poll scanner": Default 3s, Compare mtime+size, 
 * Incremental update index after change via SSE(GET /api/vault/watch)Broadcast. 
 * UI upLikerealAnnotation"External change awareness not instant", and provide manual rescan button. 
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
        log.info("[Vault] Poll scanner start: interval={}ms(macOS WatchService Non-recursive and high latency, So use poll)", intervalMs);
    }

    public long intervalMs() {
        return intervalMs;
    }

    public long indexedCount() {
        return indexService.indexedCount();
    }

    /** Refresh snapshot after write and index, Avoid scanner reindexing just-written file.  */
    public synchronized void refreshStamp(Path realPath) {
        String rel = pathResolver.toRelative(realPath);
        String stamp = realPath.toFile().lastModified() + ":" + realPath.toFile().length();
        snapshot.put(rel, stamp);
    }

    // ------------------------------------------------------------------
    // Poll Scan
    // ------------------------------------------------------------------

    @Scheduled(fixedDelayString = "${kms.vault.scan-interval-ms:3000}", initialDelayString = "${kms.vault.scan-interval-ms:3000}")
    public void scanTick() {
        try {
            rescan();
        } catch (Exception ex) {
            log.warn("[Vault] Scan failed: {}", ex.getMessage());
        }
    }

    /** Manually trigger a change scan(POST /api/vault/rescan). Backthis timeScanresult.  */
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
            throw new IllegalStateException("Scan Vault Failed", ex);
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
                    log.warn("[Vault] Incremental index failed: {} ({})", rel, ex.getMessage());
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
            log.info("[Vault] External change awareness: {}  File, elapsed {}ms -> {}", changed.size(), duration, changed);
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
