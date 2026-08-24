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
     * 只改正文（Notes tab 的自动保存）。
     *
     * 此前前端打的是 PUT /notes/{id}，但 NoteRequest.title 上有 @NotBlank，
     * 只传 content 永远 400 —— 也就是说这个自动保存从来没成功过一次。
     * 这里单开一个不要求 title 的端点，并带乐观锁 version。
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
    // Phase 4: Vault 文件接口（按 path 走，一律经 VaultPathResolver）
    // ================================================================

    public record CreateNoteRequest(String parentPath, String title, String content) {}

    public record RenameRequest(String path, String newName, Boolean updateReferences) {}

    public record MoveRequest(String path, String targetDir) {}

    public record SaveFileRequest(String content, Long baseMtime) {}

    public record SavePropertiesRequest(Map<String, Object> properties, Long baseMtime) {}

    /** 读取笔记原文（含 frontmatter 解析结果）。 */
    @GetMapping("/file")
    public Map<String, Object> readFile(@RequestParam("path") String path) {
        return vaultService.readFile(path);
    }

    /** 保存（带 mtime 冲突检测；409 + conflict 字段时前端弹出差异选择）。 */
    @PutMapping("/file")
    public Map<String, Object> saveFile(@RequestParam("path") String path, @RequestBody SaveFileRequest request) {
        return vaultService.saveFile(path, request.content(), request.baseMtime());
    }

    @PostMapping("/create")
    public Map<String, Object> createNote(@RequestBody CreateNoteRequest request) {
        return vaultService.createNote(request.parentPath(), request.title(), request.content());
    }

    /** 重命名；updateReferences=true 时批量更新 [[旧标题]] 引用。 */
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

    /** 搜索：文件名 + 全文（tsvector + 中文 bigram），返回匹配片段。 */
    @GetMapping("/search")
    public List<Map<String, Object>> search(@RequestParam(value = "q", required = false) String q) {
        return indexService.search(q);
    }

    /** 聚合全部 Properties key。 */
    @GetMapping("/properties")
    public List<String> properties() {
        return indexService.aggregatePropertyKeys();
    }

    /** Database View 数据行。 */
    @GetMapping("/table")
    public List<Map<String, Object>> table() {
        return indexService.tableRows();
    }

    /** Properties 面板写回 frontmatter。 */
    @PutMapping("/properties")
    public Map<String, Object> saveProperties(@RequestParam("path") String path,
                                              @RequestBody SavePropertiesRequest request) {
        return vaultService.saveProperties(path, request.properties(), request.baseMtime());
    }
}
