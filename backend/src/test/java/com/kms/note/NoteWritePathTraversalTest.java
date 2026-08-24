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
 * POST /api/papers/{id}/note Path traversal protection test for write entry. 
 *
 * background: theEndpointacceptCallcaller passed folder / filename and persist to vault, 
 * via NoteService.validatePath -- and VaultPathResolver is two independent impl. 
 * VaultPathResolverTest cannot coverOnelayer, So separate test. 
 *
 * Key assertion not just"Throw Exception", But rather **vaultService Never called** --
 * I.e. reject before any fs action. 
 *
 * Run: cd backend && mvn -q test -Dtest=NoteWritePathTraversalTest
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

    /** assert: reject and status 400, and no vault Write action occurs.  */
    private void assertRejected(String folder, String filename, String label) {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.createFromPaperWithContent(1L, req(folder, filename)),
                label + " Should be rejected, But no exception");
        assertEquals(400, ex.getStatus().value(), label + " Should return 400");
        verify(vaultService, never()).createNote(anyString(), anyString(), anyString());
        verify(vaultService, never()).saveFile(anyString(), anyString(), any());
    }

    // ---------- maliciousInput ----------

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
        assertRejected("papers", "sub/evil.md", "filename with /");
    }

    @Test
    void rejectsFilenameWithBackslash() {
        assertRejected("papers", "sub\\evil.md", "filename with \\");
    }

    @Test
    void rejectsFilenameWithNullByte() {
        assertRejected("papers", "evil\u0000.md", "filename with \\0");
    }

    @Test
    void rejectsFolderWithNullByte() {
        assertRejected("pap\u0000ers", "note.md", "folder with \\0");
    }

    @Test
    void rejectsAbsoluteFolder() {
        assertRejected("/etc", "passwd.md", "folder=/etc Absolute Path");
    }

    @Test
    void rejectsAbsoluteFilename() {
        assertRejected("", "/etc/passwd", "filename=/etc/passwd Absolute Path");
    }

    @Test
    void rejectsWindowsStyleAbsoluteFolder() {
        assertRejected("C:\\Windows", "evil.md", "folder=C:\\Windows");
    }

    @Test
    void rejectsFolderBackslashTraversal() {
        assertRejected("..\\..\\etc", "evil.md", "folder=..\\..\\etc");
    }

    // ---------- normalPathregression ----------

    @Test
    void acceptsNormalFolderAndFilename() {
        Note note = new Note();
        note.setId(1L);
        note.setTitle("334");
        note.setPath("papers/334.md");
        when(vaultService.createNote(anyString(), anyString(), anyString()))
                .thenReturn(Map.of("path", "papers/334.md"));
        // No.OnetimeQueryis"whetherExistsSame NameNote"--Must be empty, else will go DUPLICATE Dedup Rename; 
        // No.TwotimeQueryis createNote afterByBack path takeIndex Row. 
        when(noteRepository.findByPath("papers/334.md"))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(note));
        when(noteRepository.save(any(Note.class))).thenReturn(note);

        assertDoesNotThrow(() -> service.createFromPaperWithContent(334L, req("papers", "334.md")));
        verify(vaultService).createNote(eq("papers"), eq("334"), anyString());
    }
}
