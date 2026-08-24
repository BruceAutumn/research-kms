package com.kms.note;

import com.kms.common.ApiException;
import com.kms.literature.AiExtractionRepository;
import com.kms.note.dto.CreatePaperNoteRequest;
import com.kms.paper.Paper;
import com.kms.paper.PaperMetadataRepository;
import com.kms.paper.PaperService;
import com.kms.vault.FrontmatterService;
import com.kms.vault.LinkService;
import com.kms.vault.VaultService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * POST /api/papers/{id}/note 写入口的路径穿越防护测试。
 *
 * 背景：该端点接受调用方传入的 folder / filename 并直接落到 vault，
 * 走的是 NoteService.validatePath —— 与 VaultPathResolver 是两套独立实现。
 * VaultPathResolverTest 覆盖不到这一层，故单独立测。
 *
 * 关键断言不只是「抛异常」，而是 **vaultService 一次都没被调用** ——
 * 即拒绝发生在任何文件系统动作之前。
 *
 * 运行：cd backend && mvn -q test -Dtest=NoteWritePathTraversalTest
 */
class NoteWritePathTraversalTest {

    NoteRepository noteRepository;
    VaultService vaultService;
    FrontmatterService frontmatterService;
    LinkService linkService;
    PaperService paperService;
    PaperMetadataRepository metadataRepository;
    AiExtractionRepository aiExtractionRepository;

    NoteService service;

    @BeforeEach
    void setUp() {
        noteRepository = mock(NoteRepository.class);
        vaultService = mock(VaultService.class);
        frontmatterService = mock(FrontmatterService.class);
        linkService = mock(LinkService.class);
        paperService = mock(PaperService.class);
        metadataRepository = mock(PaperMetadataRepository.class);
        aiExtractionRepository = mock(AiExtractionRepository.class);

        Paper paper = new Paper();
        paper.setTitle("Low Power MCU Design");
        when(paperService.findPaper(anyLong())).thenReturn(paper);

        service = new NoteService(noteRepository, vaultService, frontmatterService, linkService,
                paperService, metadataRepository, aiExtractionRepository);
    }

    private CreatePaperNoteRequest req(String folder, String filename) {
        return new CreatePaperNoteRequest("some content", folder, filename, "DUPLICATE");
    }

    /** 断言：拒绝且状态 400，且没有任何 vault 写动作发生。 */
    private void assertRejected(String folder, String filename, String label) {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.createFromPaperWithContent(1L, req(folder, filename)),
                label + " 应被拒绝，但没有抛异常");
        assertEquals(400, ex.getStatus().value(), label + " 应返回 400");
        verify(vaultService, never()).createNote(anyString(), anyString(), anyString());
        verify(vaultService, never()).saveFile(anyString(), anyString(), any());
    }

    // ---------- 恶意输入 ----------

    @Test
    void rejectsFolderTraversalToSshDir() {
        assertRejected("../../../.ssh", "authorized_keys", "folder=../../../.ssh");
    }

    @Test
    void rejectsNormalizedFolderTraversal() {
        assertRejected("a/../../b", "note.md", "folder=a/../../b");
    }

    @Test
    void rejectsFilenameTraversal() {
        assertRejected("papers", "../evil.md", "filename=../evil.md");
    }

    @Test
    void rejectsFilenameWithSlash() {
        assertRejected("papers", "sub/evil.md", "filename 含 /");
    }

    @Test
    void rejectsFilenameWithBackslash() {
        assertRejected("papers", "sub\\evil.md", "filename 含 \\");
    }

    @Test
    void rejectsFilenameWithNullByte() {
        assertRejected("papers", "evil\u0000.md", "filename 含 \\0");
    }

    @Test
    void rejectsFolderWithNullByte() {
        assertRejected("pap\u0000ers", "note.md", "folder 含 \\0");
    }

    @Test
    void rejectsAbsoluteFolder() {
        assertRejected("/etc", "passwd.md", "folder=/etc 绝对路径");
    }

    @Test
    void rejectsAbsoluteFilename() {
        assertRejected("", "/etc/passwd", "filename=/etc/passwd 绝对路径");
    }

    @Test
    void rejectsWindowsStyleAbsoluteFolder() {
        assertRejected("C:\\Windows", "evil.md", "folder=C:\\Windows");
    }

    @Test
    void rejectsFolderBackslashTraversal() {
        assertRejected("..\\..\\etc", "evil.md", "folder=..\\..\\etc");
    }

    // ---------- 正常路径回归 ----------

    @Test
    void acceptsNormalFolderAndFilename() {
        Note note = new Note();
        note.setId(1L);
        note.setTitle("334");
        note.setPath("papers/334.md");
        when(vaultService.createNote(anyString(), anyString(), anyString()))
                .thenReturn(Map.of("path", "papers/334.md"));
        // 第一次查是「是否已存在同名笔记」——必须为空，否则会走 DUPLICATE 去重改名；
        // 第二次查是 createNote 之后按返回 path 取索引行。
        when(noteRepository.findByPath("papers/334.md"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(note));
        when(noteRepository.save(any(Note.class))).thenReturn(note);

        assertDoesNotThrow(() -> service.createFromPaperWithContent(334L, req("papers", "334.md")));
        verify(vaultService).createNote(eq("papers"), eq("334"), anyString());
    }
}
