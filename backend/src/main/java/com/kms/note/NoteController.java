package com.kms.note;

import com.kms.note.dto.NoteDto;
import com.kms.note.dto.NoteRequest;
import com.kms.vault.LinkService;
import com.kms.vault.VaultIndexService;
import com.kms.vault.VaultService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notes")
public class NoteController {
    private final NoteService noteService;
    private final VaultService vaultService;
    private final VaultIndexService indexService;
    private final LinkService linkService;

    public NoteController(NoteService noteService, VaultService vaultService,
                          VaultIndexService indexService, LinkService linkService) {
        this.noteService = noteService;
        this.vaultService = vaultService;
        this.indexService = indexService;
        this.linkService = linkService;
    }

    @GetMapping
    public List<NoteDto> list(@RequestParam(required = false) String q) {
        return noteService.search(q);
    }

    @PostMapping
    public NoteDto create(@Valid @RequestBody NoteRequest request) {
        return noteService.create(request);
    }

    @GetMapping("/{id}")
    public NoteDto get(@PathVariable Long id) {
        return noteService.get(id);
    }

    @PutMapping("/{id}")
    public NoteDto update(@PathVariable Long id, @Valid @RequestBody NoteRequest request) {
        return noteService.update(id, request);
    }

    /**
     * Only change body(Notes tab  Autosave). 
     *
     * before thisFrontendusing PUT /notes/{id}, But NoteRequest.title has @NotBlank, 
     * only pass content always 400 -- Alsomeans thisAutosaveneverSuccesspassOnetime. 
     * thisinseparateOnenot required title endpoint, andwith optimistic lock version. 
     */
    @PatchMapping("/{id}/content")
    public NoteDto updateContent(@PathVariable Long id, @RequestBody UpdateContentRequest request) {
        return noteService.updateContent(id, request.content() == null ? "" : request.content(), request.version());
    }

    public record UpdateContentRequest(String content, Long version) {}

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        noteService.delete(id);
    }

    @GetMapping("/{id}/backlinks")
    public List<NoteDto> backlinks(@PathVariable Long id) {
        return noteService.backlinks(id);
    }

    @GetMapping("/by-title/{title}")
    public NoteDto byTitle(@PathVariable String title) {
        return noteService.getByTitle(title);
    }

    // ================================================================
    // Phase 4: Vault File API(By path go, Onealways via VaultPathResolver)
    // ================================================================

    public record CreateNoteRequest(String parentPath, String title, String content) {}

    public record RenameRequest(String path, String newName, Boolean updateReferences) {}

    public record MoveRequest(String path, String targetDir) {}

    public record SaveFileRequest(String content, Long baseMtime) {}

    public record SavePropertiesRequest(Map<String, Object> properties, Long baseMtime) {}

    /** Read note raw(with frontmatter parse result).  */
    @GetMapping("/file")
    public Map<String, Object> readFile(@RequestParam("path") String path) {
        return vaultService.readFile(path);
    }

    /** Save(with mtime Conflict Detection; 409 + conflict Frontend pops diff on field).  */
    @PutMapping("/file")
    public Map<String, Object> saveFile(@RequestParam("path") String path, @RequestBody SaveFileRequest request) {
        return vaultService.saveFile(path, request.content(), request.baseMtime());
    }

    @PostMapping("/create")
    public Map<String, Object> createNote(@RequestBody CreateNoteRequest request) {
        return vaultService.createNote(request.parentPath(), request.title(), request.content());
    }

    /** Rename; updateReferences=true whenBatchUpdate [[Old Title]] Reference.  */
    @PostMapping("/rename")
    public Map<String, Object> rename(@RequestBody RenameRequest request) {
        return vaultService.rename(request.path(), request.newName(),
                Boolean.TRUE.equals(request.updateReferences()));
    }

    @PostMapping("/move")
    public Map<String, Object> move(@RequestBody MoveRequest request) {
        return vaultService.move(request.path(), request.targetDir());
    }

    @DeleteMapping("/file")
    public void deleteFile(@RequestParam("path") String path) {
        vaultService.delete(path);
    }

    /** search: File Name + Full Text(tsvector + Chinese bigram), BackMatchpieceSegment.  */
    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam(value = "q", required = false) String q) {
        return indexService.search(q);
    }

    /** Aggregate All Properties key.  */
    @GetMapping("/properties")
    public List<String> properties() {
        return indexService.aggregatePropertyKeys();
    }

    /** Database View Data Row.  */
    @GetMapping("/table")
    public List<Map<String, Object>> table() {
        return indexService.tableRows();
    }

    /** Properties Panel write back frontmatter.  */
    @PutMapping("/properties")
    public Map<String, Object> saveProperties(@RequestParam("path") String path,
                                              @RequestBody SavePropertiesRequest request) {
        return vaultService.saveProperties(path, request.properties(), request.baseMtime());
    }
}
