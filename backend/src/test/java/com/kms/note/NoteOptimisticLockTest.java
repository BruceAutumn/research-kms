package com.kms.note;

import com.kms.common.ApiException;
import com.kms.literature.AiExtractionRepository;
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
 * Concurrent overwrite protection for note autosave. 
 *
 * scene: sameOnepaperNotealso open in Vault Module and Reader Right Notes tab, both sides 800ms Autosave. 
 * noversionwhenwrite after willsilentoverwriteWrite first , Body lost silently. 
 *
 * Run: cd backend && mvn -q test -Dtest=NoteOptimisticLockTest
 */
class NoteOptimisticLockTest {

    NoteRepository noteRepository;
    VaultService vaultService;
    NoteService service;
    Note stored;

    @BeforeEach
    void setUp() {
        noteRepository = mock(NoteRepository.class);
        vaultService = mock(VaultService.class);

        stored = new Note();
        stored.setId(1L);
        stored.setTitle("Note");
        stored.setPath("papers/334.md");
        stored.setContent("Raw Content");
        stored.setVersion(3L);

        when(noteRepository.findById(1L)).thenReturn(Optional.of(stored));
        when(noteRepository.findByPath("papers/334.md")).thenReturn(Optional.of(stored));
        when(noteRepository.save(any(Note.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vaultService.readFile("papers/334.md")).thenReturn(Map.of("body", "Server Current Content"));

        service = new NoteService(noteRepository, vaultService, mock(FrontmatterService.class),
                mock(LinkService.class), mock(PaperService.class),
                mock(PaperMetadataRepository.class), mock(AiExtractionRepository.class));
    }

    @Test
    void savingWithMatchingVersionSucceedsAndBumpsVersion() {
        service.updateContent(1L, "myNewcontent", 3L);

        verify(vaultService).saveFile(eq("papers/334.md"), eq("myNewcontent"), any());
        assertEquals(4L, stored.getVersion(), "Version increments after save");
    }

    @Test
    void savingWithStaleVersionIsRejectedAndNothingIsWritten() {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "myNewcontent", 2L));

        assertEquals(409, ex.getStatus().value(), "version behindShould return 409");
        // Key: is not"write after error", But never written. 
        verify(vaultService, never()).saveFile(anyString(), anyString(), any());
        assertEquals(3L, stored.getVersion(), "rejectedSaveshould not change version");
    }

    @Test
    void conflictResponseCarriesServerContentSoClientCanOfferAChoice() {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "myNewcontent", 2L));

        Map<String, Object> details = ex.getExtra();
        assertNotNull(details, "409 Must carry conflict detail, otherwiseFrontendcannot giveThreeSelectOne");
        assertEquals(true, details.get("conflict"));
        assertEquals("Server Current Content", details.get("serverContent"), "Must return server content");
        assertEquals(3L, details.get("serverVersion"));
        assertEquals(2L, details.get("yourVersion"));
    }

    /** twoWindowholding sameOne  base versionFirstafterSave: No.Two MustFailed, cannot silently overwrite firstOne .  */
    @Test
    void twoWindowsSavingFromSameBaseVersionSecondOneLoses() {
        service.updateContent(1L, "Window A content", 3L);
        assertEquals(4L, stored.getVersion());

        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "Window B content", 3L),
                "Window B still gotOldversion, Must be rejected");
        assertEquals(409, ex.getStatus().value());

        // Window A  WriteoccurredOnetime, Window B no -- I.e. no silent overwrite. 
        verify(vaultService, times(1)).saveFile(anyString(), anyString(), any());
    }

    /** version pass null = Caller explicitly skips concurrency protection(agent Write tool etc), Behavior same as old.  */
    @Test
    void nullVersionSkipsTheCheckForLegacyCallers() {
        assertDoesNotThrow(() -> service.updateContent(1L, "agent Appended content"));
        verify(vaultService).saveFile(eq("papers/334.md"), eq("agent Appended content"), any());
    }
}
