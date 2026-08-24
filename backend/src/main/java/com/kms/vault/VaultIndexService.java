package com.kms.vault;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kms.note.Note;
import com.kms.note.NoteLink;
import com.kms.note.NoteLinkRepository;
import com.kms.note.NoteProperty;
import com.kms.note.NotePropertyRepository;
import com.kms.note.NoteRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Vault Index cache service. notes / note_links / note_properties All on disk .md  
 * Index Cache, Can clear then by {@link #reindexAll()} Full Rebuild -- keep anyData. 
 *
 * Index row stores no full body(notes.content setEmpty), Full-text search via PostgreSQL tsvector. 
 * due to Postgres 'simple' parser notCutdivide CJK, thisinin Java side splits Chinese into bigrams
 * (bigram)After splitting hand to to_tsvector/to_tsquery, ensureChinesesearchAvailable. 
 */
@Service
public class VaultIndexService {
    private static final Logger log = LoggerFactory.getLogger(VaultIndexService.class);

    private final NoteRepository noteRepository;
    private final NoteLinkRepository linkRepository;
    private final NotePropertyRepository propertyRepository;
    private final VaultPathResolver pathResolver;
    private final FrontmatterService frontmatterService;
    private final WikiLinkParser wikiLinkParser;
    private final ObjectMapper objectMapper;

    public VaultIndexService(NoteRepository noteRepository, NoteLinkRepository linkRepository,
                             NotePropertyRepository propertyRepository, VaultPathResolver pathResolver,
                             FrontmatterService frontmatterService, WikiLinkParser wikiLinkParser,
                             ObjectMapper objectMapper) {
        this.noteRepository = noteRepository;
        this.linkRepository = linkRepository;
        this.propertyRepository = propertyRepository;
        this.pathResolver = pathResolver;
        this.frontmatterService = frontmatterService;
        this.wikiLinkParser = wikiLinkParser;
        this.objectMapper = objectMapper;
    }

    // ------------------------------------------------------------------
    // Single file index
    // ------------------------------------------------------------------

    /** Index single existing file(Read -> parse -> upsert -> rebuild properties/links). 
     *  synchronized: Poll scanner and request may index same file, 
     *  Must serialize to avoid delete/insert interleaveTriggeruniqueOneconstraintConflict.  */
    @Transactional
    public synchronized Note indexFile(Path realPath) {
        String relPath = pathResolver.toRelative(realPath);
        String content;
        try {
            content = Files.readString(realPath, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new IllegalStateException("Read file failed: " + relPath, ex);
        }
        long mtime = realPath.toFile().lastModified();
        String hash = sha256(content);
        String fileName = realPath.getFileName().toString();
        String title = WikiLinkParser.noteNameOf(fileName);

        FrontmatterService.ParsedFrontmatter parsed = frontmatterService.parse(content);
        Map<String, Object> properties = parsed.data();

        Note note = noteRepository.findByPath(relPath).orElseGet(Note::new);
        note.setUserId(1L);
        note.setTitle(title);
        note.setContent(""); // Index stores no full body(Source of truth is file)
        note.setProperties(properties);
        note.setPath(relPath);
        note.setMtime(mtime);
        note.setContentHash(hash);
        note.setIndexedAt(OffsetDateTime.now());
        // frontmatter in  paperId Sync to paper_id Column(Phase 6 common)
        if (properties.get("paperId") instanceof Number number) {
            note.setPaperId(number.longValue());
        }
        Note saved = noteRepository.save(note);

        // tsvector: Chinese bigram + latin token Mixed, Title Weighted
        String tokens = toTsTokens(title) + " " + toTsTokens(content);
        noteRepository.updateSearchVector(saved.getId(), tokens);

        rebuildProperties(saved, properties);
        rebuildLinksForNote(saved, content);
        // thisFileafter appear, Unresolved links to this title auto-resolve(Obsidian Behavior)
        linkRepository.resolveTitleToPath(title, relPath);
        return saved;
    }

    private void rebuildProperties(Note note, Map<String, Object> properties) {
        propertyRepository.deleteByNoteId(note.getId());
        propertyRepository.flush(); // forceFirst DELETE after INSERT(Hibernate flush Default INSERT before, will hit uniqueOnekey)
        if (properties.isEmpty()) {
            return;
        }
        List<NoteProperty> rows = new ArrayList<>();
        properties.forEach((key, value) -> {
            NoteProperty row = new NoteProperty();
            row.setNoteId(note.getId());
            row.setKey(key);
            row.setValue(serializeValue(value));
            row.setValueType(frontmatterService.typeOf(value));
            rows.add(row);
        });
        propertyRepository.saveAll(rows);
    }

    private void rebuildLinksForNote(Note note, String content) {
        linkRepository.deleteBySourceNoteId(note.getId());
        linkRepository.flush(); // same as above: First DELETE after INSERT
        List<WikiLinkParser.WikiLink> links = wikiLinkParser.parse(content);
        if (links.isEmpty()) {
            return;
        }
        Map<String, String> titleToPath = titleToPathMap(note.getPath());
        List<NoteLink> rows = new ArrayList<>();
        for (WikiLinkParser.WikiLink link : links) {
            String targetTitle = link.targetTitle();
            String targetPath = titleToPath.get(targetTitle.toLowerCase(Locale.ROOT));
            NoteLink row = new NoteLink();
            row.setSourceNoteId(note.getId());
            row.setSourcePath(note.getPath());
            row.setTargetTitle(targetTitle);
            row.setTargetRaw(link.targetRaw());
            row.setAlias(link.alias());
            row.setTargetPath(targetPath);
            row.setResolved(targetPath != null);
            rows.add(row);
        }
        linkRepository.saveAll(rows);
    }

    /** Title(Lowercase) -> Relative Path. currentFileselfAlsoinAmong(self-link allow, Graph can show in).  */
    private Map<String, String> titleToPathMap(String excludePath) {
        Map<String, String> map = new HashMap<>();
        for (Note note : noteRepository.findAllIndexed()) {
            if (note.getPath() != null && !note.getPath().equals(excludePath)) {
                map.putIfAbsent(note.getTitle().toLowerCase(Locale.ROOT), note.getPath());
            }
        }
        return map;
    }

    // ------------------------------------------------------------------
    // Delete / Full Rebuild
    // ------------------------------------------------------------------

    @Transactional
    public void removeIndex(String relPath) {
        Note note = noteRepository.findByPath(relPath).orElse(null);
        if (note == null) {
            return;
        }
        linkRepository.deleteBySourceNoteId(note.getId());
        propertyRepository.deleteByNoteId(note.getId());
        noteRepository.delete(note);
        log.info("[Vault] index removed: {}", relPath);
    }

    /** Full Rebuild: Scan after clearing three index tables Vault All inside .md rebuild. anytimeCallall keptData. 
     *  synchronized: and indexFile / Poll scan serial, Avoid clear-rebuild race.  */
    @Transactional
    public synchronized Map<String, Object> reindexAll() {
        long start = System.currentTimeMillis();
        linkRepository.deleteAll();
        propertyRepository.deleteAll();
        noteRepository.deleteAll();
        linkRepository.flush();
        propertyRepository.flush();
        noteRepository.flush();

        List<Path> mdFiles = new ArrayList<>();
        try (var stream = Files.walk(pathResolver.root())) {
            stream.filter(Files::isRegularFile)
                    .filter(path -> path.getFileName().toString().toLowerCase(Locale.ROOT).endsWith(".md"))
                    .forEach(mdFiles::add);
        } catch (IOException ex) {
            throw new IllegalStateException("Scan Vault Failed", ex);
        }

        int notes = 0;
        for (Path file : mdFiles) {
            try {
                indexFile(file);
                notes++;
            } catch (Exception ex) {
                log.warn("[Vault] Index failed, Skip: {} ({})", file, ex.getMessage());
            }
        }
        long duration = System.currentTimeMillis() - start;
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("mdFiles", mdFiles.size());
        result.put("notes", notes);
        result.put("links", linkRepository.count());
        result.put("properties", propertyRepository.count());
        result.put("durationMs", duration);
        log.info("[Vault] reindex done: {} md files, {} notes, {}ms", mdFiles.size(), notes, duration);
        return result;
    }

    // ------------------------------------------------------------------
    // Query(Index only for search/Backlinks/graph/Table, Body reads file)
    // ------------------------------------------------------------------

    public List<Map<String, Object>> search(String q) {
        String query = q == null ? "" : q.trim();
        List<Note> hits;
        if (query.isEmpty()) {
            hits = noteRepository.findAllIndexed().stream().limit(50).toList();
        } else {
            hits = noteRepository.searchByTsvector(toTsQueryTokens(query));
        }
        List<Map<String, Object>> results = new ArrayList<>();
        for (Note note : hits) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("path", note.getPath());
            row.put("title", note.getTitle());
            row.put("mtime", note.getMtime());
            row.put("snippet", snippetFor(note.getPath(), query));
            results.add(row);
        }
        return results;
    }

    private String snippetFor(String relPath, String query) {
        if (relPath == null) {
            return "";
        }
        try {
            String content = Files.readString(pathResolver.resolveExisting(relPath), StandardCharsets.UTF_8);
            String haystack = content.toLowerCase(Locale.ROOT);
            String needle = query.toLowerCase(Locale.ROOT);
            int idx = haystack.indexOf(needle);
            if (idx < 0 && query.length() >= 2) {
                idx = haystack.indexOf(needle.substring(0, 2)); // CJK bigram first word
            }
            if (idx < 0) {
                return content.length() > 80 ? content.substring(0, 80) + "..." : content;
            }
            int from = Math.max(0, idx - 40);
            int to = Math.min(content.length(), idx + query.length() + 60);
            return (from > 0 ? "..." : "") + content.substring(from, to).replace("\n", " ") + (to < content.length() ? "..." : "");
        } catch (Exception ex) {
            return "";
        }
    }

    /** Update inbound links to old path after move.  */
    @Transactional
    public void updateLinkTargetPaths(String oldPath, String newPath) {
        linkRepository.updateTargetPath(oldPath, newPath);
    }

    /** Aggregate All Properties key(Database View Column).  */
    public List<String> aggregatePropertyKeys() {
        return propertyRepository.findAll().stream().map(NoteProperty::getKey).distinct().sorted().toList();
    }

    public List<Note> allIndexedNotes() {
        return noteRepository.findAllIndexed();
    }

    /** useTitle token Find candidate notes(Unlinked mentions Candidate Set).  */
    public List<Note> searchByTitleTokens(String title) {
        String query = toTsQueryTokens(title);
        if (query.isBlank()) {
            return List.of();
        }
        return noteRepository.searchByTsvector(query);
    }

    public long indexedCount() {
        return noteRepository.findAllIndexed().size();
    }

    /** Database View Row Data: allNote  frontmatter Properties + Base Fields.  */
    public List<Map<String, Object>> tableRows() {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Note note : noteRepository.findAllIndexed()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("path", note.getPath());
            row.put("title", note.getTitle());
            row.put("folder", folderOf(note.getPath()));
            row.put("mtime", note.getMtime());
            Map<String, Object> properties = note.getProperties();
            properties.forEach(row::putIfAbsent);
            row.put("properties", properties);
            rows.add(row);
        }
        return rows;
    }

    public String folderOf(String relPath) {
        if (relPath == null) {
            return "";
        }
        int slash = relPath.lastIndexOf('/');
        return slash > 0 ? relPath.substring(0, slash) : "";
    }

    // ------------------------------------------------------------------
    // tsvector Chinese bigram Process
    // ------------------------------------------------------------------

    /** CJK continuousSegmentByTwochar groupCutdivide, Others token(letter/Number)Keep as-is.  */
    static String toTsTokens(String text) {
        if (text == null) {
            return "";
        }
        StringBuilder out = new StringBuilder();
        Matcher cjk = Pattern.compile("[\\p{IsHan}\\p{IsHiragana}\\p{IsKatakana}]+").matcher(text);
        int last = 0;
        while (cjk.find()) {
            out.append(text, last, cjk.start()).append(' ');
            String run = cjk.group();
            if (run.length() == 1) {
                out.append(run).append(' ');
            } else {
                for (int i = 0; i <= run.length() - 2; i++) {
                    out.append(run, i, i + 2).append(' ');
                }
            }
            last = cjk.end();
        }
        out.append(text, last, text.length());
        String result = out.toString().replaceAll("[^\\p{L}\\p{N}_]+", " ").trim();
        return result;
    }

    static String toTsQueryTokens(String query) {
        String tokens = toTsTokens(query);
        if (tokens.isBlank()) {
            return "";
        }
        String[] parts = tokens.trim().split("\\s+");
        StringBuilder out = new StringBuilder();
        for (String part : parts) {
            if (out.length() > 0) {
                out.append(" & ");
            }
            out.append(part).append(":*");
        }
        return out.toString();
    }

    private String serializeValue(Object value) {
        if (value == null) {
            return "";
        }
        if (value instanceof String || value instanceof Number || value instanceof Boolean) {
            return String.valueOf(value);
        }
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            return String.valueOf(value);
        }
    }

    private String sha256(String content) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(content.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            return "";
        }
    }
}
