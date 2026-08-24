package com.kms.vault;

import com.kms.common.ApiException;
import com.kms.note.Note;
import com.kms.note.NoteLink;
import com.kms.note.NoteLinkRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Backlink Query: Backlinks / Outgoing / Unlinked mentions / Build Link. 
 * Linked go note_links Index; Unlinked use tsvector Candidate + Read file char-by-char verify
 * (Title plain text appears and not [[]] wrap). 
 */
@Service
public class LinkService {

    private final NoteLinkRepository linkRepository;
    private final VaultIndexService indexService;
    private final VaultPathResolver pathResolver;

    public LinkService(NoteLinkRepository linkRepository, VaultIndexService indexService,
                       VaultPathResolver pathResolver) {
        this.linkRepository = linkRepository;
        this.indexService = indexService;
        this.pathResolver = pathResolver;
    }

    public List<Map<String, Object>> outgoing(String relPath) {
        pathResolver.resolveExisting(relPath); // check
        List<Map<String, Object>> rows = new ArrayList<>();
        for (NoteLink link : linkRepository.findBySourcePath(relPath)) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("targetTitle", link.getTargetTitle());
            row.put("targetPath", link.getTargetPath());
            row.put("targetRaw", link.getTargetRaw());
            row.put("alias", link.getAlias());
            row.put("resolved", link.isResolved());
            rows.add(row);
        }
        return rows;
    }

    /** Linked mentions: target = currentNote(ParsedPath + Unresolved but title points to this note).  */
    public List<Map<String, Object>> backlinks(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        String title = WikiLinkParser.noteNameOf(real.getFileName().toString());
        Map<String, Map<String, Object>> bySource = new LinkedHashMap<>();
        for (NoteLink link : linkRepository.findByTargetPath(relPath)) {
            bySource.put(link.getSourcePath(), mentionRow(link.getSourcePath(), link.getTargetTitle(), title));
        }
        for (NoteLink link : linkRepository.findByTargetTitleAndResolvedFalse(title)) {
            bySource.putIfAbsent(link.getSourcePath(), mentionRow(link.getSourcePath(), link.getTargetTitle(), title));
        }
        return new ArrayList<>(bySource.values());
    }

    private Map<String, Object> mentionRow(String sourcePath, String targetTitle, String currentTitle) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("path", sourcePath);
        row.put("title", sourcePath == null ? "" : WikiLinkParser.noteNameOf(sourcePath.substring(sourcePath.lastIndexOf('/') + 1)));
        row.put("snippet", snippetAround(sourcePath, "[[" + (targetTitle == null ? currentTitle : targetTitle)));
        return row;
    }

    /** Unlinked mentions: Title plain text appears and not [[]] wrap(Read file verify).  */
    public List<Map<String, Object>> unlinked(String relPath) {
        Path real = pathResolver.resolveExisting(relPath);
        String title = WikiLinkParser.noteNameOf(real.getFileName().toString());
        List<Map<String, Object>> rows = new ArrayList<>();
        List<Note> candidates = indexService.searchByTitleTokens(title);
        Pattern linkedForm = Pattern.compile("\\[\\[" + Pattern.quote(title) + "(?:[#\\]|])");
        Pattern mentionForm = Pattern.compile("(?<!\\[)" + Pattern.quote(title));
        for (Note note : candidates) {
            String rel = note.getPath();
            if (rel == null || rel.equals(relPath)) {
                continue;
            }
            try {
                String content = Files.readString(pathResolver.resolveExisting(rel), StandardCharsets.UTF_8);
                Matcher linked = linkedForm.matcher(content);
                if (linked.find()) {
                    continue; // Existing [[]] Link, not count unlinked
                }
                Matcher mention = mentionForm.matcher(content);
                if (!mention.find()) {
                    continue;
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("path", rel);
                row.put("title", note.getTitle());
                row.put("snippet", snippetAround(rel, title));
                rows.add(row);
            } catch (IOException | ApiException ex) {
                // Skip unreadable file
            }
        }
        return rows;
    }

    /** "Build Link": sourceFileinNo.Oneplain text atTitlerewrite to [[Title]](Write file then update index).  */
    public Map<String, Object> createLink(String sourcePath, String targetTitle) {
        Path real = pathResolver.resolveExisting(sourcePath);
        String target = targetTitle == null ? "" : targetTitle.trim();
        if (target.isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "targetTitle cannot beEmpty. ");
        }
        String content;
        try {
            content = Files.readString(real, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Read file failed. ");
        }
        Pattern linkedForm = Pattern.compile("\\[\\[" + Pattern.quote(target) + "(?:[#\\]|])");
        if (linkedForm.matcher(content).find()) {
            throw new ApiException(HttpStatus.CONFLICT, "theNoteExistspoint to thisTitle Link. ");
        }
        Pattern mentionForm = Pattern.compile("(?<!\\[)" + Pattern.quote(target));
        Matcher matcher = mentionForm.matcher(content);
        if (!matcher.find()) {
            throw new ApiException(HttpStatus.NOT_FOUND, "No plain text of this title in source. ");
        }
        String rewritten = content.substring(0, matcher.start()) + "[[" + target + "]]" + content.substring(matcher.end());
        try {
            Files.writeString(real, rewritten, StandardCharsets.UTF_8);
        } catch (IOException ex) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, "Write file failed. ");
        }
        indexService.indexFile(real);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sourcePath", sourcePath);
        result.put("targetTitle", target);
        result.put("linked", true);
        return result;
    }

    /** in sourceFileinextractKeywordsnearbyContext(provide Backlinks show).  */
    private String snippetAround(String relPath, String needle) {
        if (relPath == null || needle == null) {
            return "";
        }
        try {
            String content = Files.readString(pathResolver.resolveExisting(relPath), StandardCharsets.UTF_8);
            int idx = content.toLowerCase(Locale.ROOT).indexOf(needle.toLowerCase(Locale.ROOT));
            if (idx < 0) {
                return content.length() > 60 ? content.substring(0, 60) + "..." : content;
            }
            int from = Math.max(0, idx - 30);
            int to = Math.min(content.length(), idx + needle.length() + 50);
            return (from > 0 ? "..." : "") + content.substring(from, to).replace("\n", " ") + (to < content.length() ? "..." : "");
        } catch (Exception ex) {
            return "";
        }
    }
}
