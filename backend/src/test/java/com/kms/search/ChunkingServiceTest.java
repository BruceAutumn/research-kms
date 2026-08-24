package com.kms.search;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ChunkingService 单元测试。
 * 覆盖：中文长文 / 英文长文 / 恰好边界 / 空文本 / 短于一块 / 无断点死循环防护。
 * 运行：cd backend && mvn -q test -Dtest=ChunkingServiceTest
 */
class ChunkingServiceTest {

    private final ChunkingService service = new ChunkingService();

    private static String repeat(String unit, int targetLen) {
        StringBuilder sb = new StringBuilder();
        while (sb.length() < targetLen) sb.append(unit);
        return sb.substring(0, targetLen);
    }

    /** 每个块都不超过目标块长，下标连续从 0 开始，偏移与文本严格对应。 */
    private void assertWellFormed(List<ChunkingService.Chunk> chunks, String source) {
        for (int i = 0; i < chunks.size(); i++) {
            ChunkingService.Chunk c = chunks.get(i);
            assertEquals(i, c.index(), "块下标应连续");
            assertTrue(c.text().length() <= ChunkingService.CHUNK_CHARS,
                    "块长 " + c.text().length() + " 超过上限");
            assertTrue(c.text().length() >= ChunkingService.MIN_CHUNK_CHARS,
                    "块长 " + c.text().length() + " 低于下限，本应被丢弃");
            assertEquals(source.substring(c.charStart(), c.charEnd()), c.text(),
                    "charStart/charEnd 必须能在原文中还原出 text");
            if (i > 0) {
                assertTrue(c.charStart() > chunks.get(i - 1).charStart(), "起点必须严格前进");
            }
        }
    }

    // ---------- 空 / 极短 ----------

    @Test
    void nullTextYieldsNoChunks() {
        assertTrue(service.chunk(null).isEmpty());
    }

    @Test
    void emptyAndBlankTextYieldNoChunks() {
        assertTrue(service.chunk("").isEmpty());
        assertTrue(service.chunk("   \n\n  \t ").isEmpty());
    }

    @Test
    void textShorterThanMinimumIsDiscarded() {
        assertTrue(service.chunk("太短了").isEmpty(), "低于 50 字符的碎片应被丢弃");
    }

    @Test
    void textShorterThanOneChunkYieldsExactlyOneChunk() {
        String text = repeat("低功耗单片机设计要点。", 200);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(1, chunks.size());
        assertEquals(text, chunks.get(0).text());
        assertWellFormed(chunks, text);
    }

    // ---------- 恰好边界 ----------

    @Test
    void textExactlyOneChunkLongYieldsOneChunk() {
        String text = repeat("a", ChunkingService.CHUNK_CHARS);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(1, chunks.size(), "恰好 800 字符不应被切成两块");
        assertEquals(ChunkingService.CHUNK_CHARS, chunks.get(0).text().length());
    }

    @Test
    void textOneCharOverBoundaryYieldsTwoChunks() {
        String text = repeat("a", ChunkingService.CHUNK_CHARS + 1);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(2, chunks.size());
        assertWellFormed(chunks, text);
    }

    // ---------- 长文 ----------

    @Test
    void chineseLongTextIsChunkedWithOverlap() {
        String text = repeat("低功耗单片机在物联网终端中的应用研究表明，动态电压频率调节可显著降低静态功耗。", 5000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);

        assertTrue(chunks.size() >= 6, "5000 字中文至少应切出 6 块，实际 " + chunks.size());
        assertWellFormed(chunks, text);

        // 相邻块必须有重叠：后一块起点应早于前一块终点。
        for (int i = 1; i < chunks.size(); i++) {
            assertTrue(chunks.get(i).charStart() < chunks.get(i - 1).charEnd(),
                    "第 " + i + " 块与上一块之间没有重叠");
        }
        assertEquals(text.length(), chunks.get(chunks.size() - 1).charEnd(), "尾部内容不应丢失");
    }

    @Test
    void englishLongTextIsChunkedWithOverlap() {
        String text = repeat("Power saving has always been an important research direction in microcontroller design. ", 5000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);

        assertTrue(chunks.size() >= 6, "5000 字符英文至少应切出 6 块，实际 " + chunks.size());
        assertWellFormed(chunks, text);
        for (int i = 1; i < chunks.size(); i++) {
            assertTrue(chunks.get(i).charStart() < chunks.get(i - 1).charEnd(),
                    "第 " + i + " 块与上一块之间没有重叠");
        }
    }

    // ---------- 断点选择 ----------

    @Test
    void prefersParagraphBreakOverHardCut() {
        String head = repeat("这是第一段的内容，讲的是功耗模型。", 700);
        String tail = repeat("这是第二段的内容，讲的是实验结果。", 700);
        String text = head + "\n\n" + tail;

        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertTrue(chunks.size() >= 2);
        // 首块应在空行处断开，而不是硬切在第 800 字符。
        assertEquals(head.length(), chunks.get(0).charEnd(),
                "首块应恰好在段落分隔处结束");
    }

    @Test
    void prefersSentenceEndWhenNoParagraphBreak() {
        String text = repeat("这是一句完整的话。", 3000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertWellFormed(chunks, text);
        // 每块都应以句号收尾（除最后一块可能被原文长度截断）。
        for (int i = 0; i < chunks.size() - 1; i++) {
            assertTrue(chunks.get(i).text().endsWith("。"),
                    "第 " + i + " 块未在句末断开：…" + chunks.get(i).text().substring(chunks.get(i).text().length() - 5));
        }
    }

    // ---------- 无断点：死循环防护 ----------

    @Test
    void textWithNoBoundariesStillTerminatesAndCoversEverything() {
        String text = repeat("x", 5000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertFalse(chunks.isEmpty());
        assertWellFormed(chunks, text);
        assertEquals(0, chunks.get(0).charStart());
        assertEquals(text.length(), chunks.get(chunks.size() - 1).charEnd());
    }
}
