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
 * 笔记自动保存的并发覆盖防护。
 *
 * 场景：同一篇笔记同时开在 Vault 模块和 Reader 右侧 Notes tab，两边都在 800ms 自动保存。
 * 没有版本号时后写的会静默覆盖先写的，正文丢失且无人知晓。
 *
 * 运行：cd backend && mvn -q test -Dtest=NoteOptimisticLockTest
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
        stored.setTitle("笔记");
        stored.setPath("papers/334.md");
        stored.setContent("原始内容");
        stored.setVersion(3L);

        when(noteRepository.findById(1L)).thenReturn(Optional.of(stored));
        when(noteRepository.findByPath("papers/334.md")).thenReturn(Optional.of(stored));
        when(noteRepository.save(any(Note.class))).thenAnswer(inv -> inv.getArgument(0));
        when(vaultService.readFile("papers/334.md")).thenReturn(Map.of("body", "服务端当前内容"));

        service = new NoteService(noteRepository, vaultService, mock(FrontmatterService.class),
                mock(LinkService.class), mock(PaperService.class),
                mock(PaperMetadataRepository.class), mock(AiExtractionRepository.class));
    }

    @Test
    void savingWithMatchingVersionSucceedsAndBumpsVersion() {
        service.updateContent(1L, "我的新内容", 3L);

        verify(vaultService).saveFile(eq("papers/334.md"), eq("我的新内容"), any());
        assertEquals(4L, stored.getVersion(), "保存成功后版本号应递增");
    }

    @Test
    void savingWithStaleVersionIsRejectedAndNothingIsWritten() {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "我的新内容", 2L));

        assertEquals(409, ex.getStatus().value(), "版本落后应返回 409");
        // 关键：不是「报错之后照样写」，而是压根没写。
        verify(vaultService, never()).saveFile(anyString(), anyString(), any());
        assertEquals(3L, stored.getVersion(), "被拒绝的保存不应改动版本号");
    }

    @Test
    void conflictResponseCarriesServerContentSoClientCanOfferAChoice() {
        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "我的新内容", 2L));

        Map<String, Object> details = ex.getExtra();
        assertNotNull(details, "409 必须带冲突详情，否则前端无法给出三选一");
        assertEquals(true, details.get("conflict"));
        assertEquals("服务端当前内容", details.get("serverContent"), "必须回传服务端当前内容");
        assertEquals(3L, details.get("serverVersion"));
        assertEquals(2L, details.get("yourVersion"));
    }

    /** 两个窗口拿着同一个 base 版本先后保存：第二个必须失败，不能静默覆盖第一个。 */
    @Test
    void twoWindowsSavingFromSameBaseVersionSecondOneLoses() {
        service.updateContent(1L, "窗口 A 的内容", 3L);
        assertEquals(4L, stored.getVersion());

        ApiException ex = assertThrows(ApiException.class,
                () -> service.updateContent(1L, "窗口 B 的内容", 3L),
                "窗口 B 拿的还是旧版本，必须被拒绝");
        assertEquals(409, ex.getStatus().value());

        // 窗口 A 的写入发生过一次，窗口 B 的没有 —— 即没有发生静默覆盖。
        verify(vaultService, times(1)).saveFile(anyString(), anyString(), any());
    }

    /** version 传 null = 调用方明确放弃并发保护（agent 写工具等），行为同旧版。 */
    @Test
    void nullVersionSkipsTheCheckForLegacyCallers() {
        assertDoesNotThrow(() -> service.updateContent(1L, "agent 追加的内容"));
        verify(vaultService).saveFile(eq("papers/334.md"), eq("agent 追加的内容"), any());
    }
}
