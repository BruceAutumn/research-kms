package com.kms.vault;

import com.kms.note.Note;
import com.kms.note.NoteLink;
import com.kms.note.NoteLinkRepository;
import com.kms.note.NoteRepository;
import org.springframework.stereotype.Service;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 关系图谱数据服务（Cytoscape.js 消费）。Graph 是分析工具，不是首页动画：
 * 后端只出 {nodes, edges}，前端渲染与降级策略在 GraphPanel。
 */
@Service
public class GraphService {

    private final NoteRepository noteRepository;
    private final NoteLinkRepository linkRepository;
    private final VaultIndexService indexService;

    public GraphService(NoteRepository noteRepository, NoteLinkRepository linkRepository,
                        VaultIndexService indexService) {
        this.noteRepository = noteRepository;
        this.linkRepository = linkRepository;
        this.indexService = indexService;
    }

    public Map<String, Object> global() {
        List<Note> notes = noteRepository.findAllIndexed();
        Map<String, String> pathToTitle = new HashMap<>();
        for (Note note : notes) {
            pathToTitle.put(note.getPath(), note.getTitle());
        }
        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Integer> inDegree = new HashMap<>();
        List<Map<String, Object>> edges = new ArrayList<>();
        List<NoteLink> links = linkRepository.findAll();
        Set<String> allPaths = pathToTitle.keySet();
        for (NoteLink link : links) {
            String targetKey = link.getTargetPath() != null && allPaths.contains(link.getTargetPath())
                    ? link.getTargetPath()
                    : "unresolved:" + link.getTargetTitle();
            inDegree.merge(targetKey, 1, Integer::sum);
        }
        Set<String> unresolvedTitles = new LinkedHashSet<>();
        for (Note note : notes) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", note.getPath());
            node.put("label", note.getTitle());
            node.put("folder", indexService.folderOf(note.getPath()));
            node.put("inDegree", inDegree.getOrDefault(note.getPath(), 0));
            node.put("resolved", true);
            nodes.add(node);
        }
        for (NoteLink link : links) {
            Map<String, Object> edge = new LinkedHashMap<>();
            edge.put("source", link.getSourcePath());
            String targetId;
            boolean resolved = link.isResolved() && link.getTargetPath() != null
                    && allPaths.contains(link.getTargetPath());
            if (resolved) {
                targetId = link.getTargetPath();
            } else {
                targetId = "unresolved:" + link.getTargetTitle();
                unresolvedTitles.add(link.getTargetTitle());
            }
            edge.put("target", targetId);
            edge.put("resolved", resolved);
            edges.add(edge);
        }
        for (String title : unresolvedTitles) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", "unresolved:" + title);
            node.put("label", title);
            node.put("inDegree", inDegree.getOrDefault("unresolved:" + title, 0));
            node.put("resolved", false);
            nodes.add(node);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("nodes", nodes);
        result.put("edges", edges);
        result.put("stats", Map.of("nodes", nodes.size(), "edges", edges.size()));
        return result;
    }

    /** Local Graph：当前笔记 + depth 层邻居（双向 BFS，depth 1–3）。 */
    public Map<String, Object> local(String relPath, int depth) {
        int maxDepth = Math.max(1, Math.min(depth <= 0 ? 1 : depth, 3));
        Map<String, List<String>> adjacency = new HashMap<>();
        List<Note> notes = noteRepository.findAllIndexed();
        Map<String, String> pathToTitle = new HashMap<>();
        Set<String> allPaths = new HashSet<>();
        for (Note note : notes) {
            pathToTitle.put(note.getPath(), note.getTitle());
            allPaths.add(note.getPath());
            adjacency.computeIfAbsent(note.getPath(), key -> new ArrayList<>());
        }
        for (NoteLink link : linkRepository.findAll()) {
            String source = link.getSourcePath();
            if (source == null) {
                continue;
            }
            if (link.isResolved() && link.getTargetPath() != null && allPaths.contains(link.getTargetPath())) {
                adjacency.computeIfAbsent(source, key -> new ArrayList<>()).add(link.getTargetPath());
                adjacency.computeIfAbsent(link.getTargetPath(), key -> new ArrayList<>()).add(source);
            }
        }
        Set<String> included = new HashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        Map<String, Integer> dist = new HashMap<>();
        if (allPaths.contains(relPath)) {
            queue.add(relPath);
            dist.put(relPath, 0);
            included.add(relPath);
        }
        while (!queue.isEmpty()) {
            String current = queue.poll();
            int d = dist.get(current);
            if (d >= maxDepth) {
                continue;
            }
            for (String next : adjacency.getOrDefault(current, List.of())) {
                if (!included.contains(next)) {
                    included.add(next);
                    dist.put(next, d + 1);
                    queue.add(next);
                }
            }
        }
        Map<String, Object> result = new LinkedHashMap<>();
        List<Map<String, Object>> nodes = new ArrayList<>();
        Map<String, Integer> inDegree = new HashMap<>();
        for (NoteLink link : linkRepository.findAll()) {
            if (link.isResolved() && link.getTargetPath() != null && included.contains(link.getTargetPath())) {
                inDegree.merge(link.getTargetPath(), 1, Integer::sum);
            }
        }
        for (String path : included) {
            Map<String, Object> node = new LinkedHashMap<>();
            node.put("id", path);
            node.put("label", pathToTitle.getOrDefault(path, path));
            node.put("inDegree", inDegree.getOrDefault(path, 0));
            node.put("depth", dist.getOrDefault(path, 0));
            node.put("resolved", true);
            nodes.add(node);
        }
        List<Map<String, Object>> edges = new ArrayList<>();
        Set<String> seenEdges = new HashSet<>();
        for (NoteLink link : linkRepository.findAll()) {
            if (!link.isResolved() || link.getTargetPath() == null) {
                continue;
            }
            String a = link.getSourcePath();
            String b = link.getTargetPath();
            if (included.contains(a) && included.contains(b)) {
                String key = a.compareTo(b) <= 0 ? a + "|" + b : b + "|" + a;
                if (seenEdges.add(key)) {
                    Map<String, Object> edge = new LinkedHashMap<>();
                    edge.put("source", a);
                    edge.put("target", b);
                    edge.put("resolved", true);
                    edges.add(edge);
                }
            }
        }
        result.put("nodes", nodes);
        result.put("edges", edges);
        result.put("stats", Map.of("nodes", nodes.size(), "edges", edges.size(), "depth", maxDepth));
        return result;
    }
}
