package com.kms.search;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ChunkingService unit test. 
 * overwrite: Chinese long text / English long text / exact boundary / Empty Text / shorter thanOneBlock / No breakpoint infinite loop guard. 
 * Run: cd backend && mvn -q test -Dtest=ChunkingServiceTest
 */
class ChunkingServiceTest {

    private final ChunkingService service = new ChunkingService();

    private static String repeat(String unit, int targetLen) {
        StringBuilder sb = new StringBuilder();
        while (sb.length() < targetLen) sb.append(unit);
        return sb.substring(0, targetLen);
    }

    /** Each block does not exceed target length, subscripts continuous from 0 start, offsetandtext strictlyToshould.  */
    private void assertWellFormed(List<ChunkingService.Chunk> chunks, String source) {
        for (int i = 0; i < chunks.size(); i++) {
            ChunkingService.Chunk c = chunks.get(i);
            assertEquals(i, c.index(), "Block subscripts should be consecutive");
            assertTrue(c.text().length() <= ChunkingService.CHUNK_CHARS,
                    "Block Length " + c.text().length() + " over limit");
            assertTrue(c.text().length() >= ChunkingService.MIN_CHUNK_CHARS,
                    "Block Length " + c.text().length() + " below min, should be discarded");
            assertEquals(source.substring(c.charStart(), c.charEnd()), c.text(),
                    "charStart/charEnd Must restore in original text");
            if (i > 0) {
                assertTrue(c.charStart() > chunks.get(i - 1).charStart(), "startPointMuststrict advance");
            }
        }
    }

    // ---------- Empty / very short ----------

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
        assertTrue(service.chunk("too short").isEmpty(), "below 50 char fragments should be discarded");
    }

    @Test
    void textShorterThanOneChunkYieldsExactlyOneChunk() {
        String text = repeat("Low-power MCU design points. ", 200);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(1, chunks.size());
        assertEquals(text, chunks.get(0).text());
        assertWellFormed(chunks, text);
    }

    // ---------- exact boundary ----------

    @Test
    void textExactlyOneChunkLongYieldsOneChunk() {
        String text = repeat("a", ChunkingService.CHUNK_CHARS);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(1, chunks.size(), "exactly 800 char should notCutinto twoBlock");
        assertEquals(ChunkingService.CHUNK_CHARS, chunks.get(0).text().length());
    }

    @Test
    void textOneCharOverBoundaryYieldsTwoChunks() {
        String text = repeat("a", ChunkingService.CHUNK_CHARS + 1);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertEquals(2, chunks.size());
        assertWellFormed(chunks, text);
    }

    // ---------- Long Text ----------

    @Test
    void chineseLongTextIsChunkedWithOverlap() {
        String text = repeat("Low-power MCU in IoT terminals shows, DVFS significantly reduces static power. ", 5000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);

        assertTrue(chunks.size() >= 6, "5000 charChineseat leastCutout 6 Block, actual " + chunks.size());
        assertWellFormed(chunks, text);

        // adjacentBlockMusthas overlap: afterOneBlockstartPointshould beforeOneBlockendPoint. 
        for (int i = 1; i < chunks.size(); i++) {
            assertTrue(chunks.get(i).charStart() < chunks.get(i - 1).charEnd(),
                    "No. " + i + " No overlap between block and previous");
        }
        assertEquals(text.length(), chunks.get(chunks.size() - 1).charEnd(), "tail content should not lose");
    }

    @Test
    void englishLongTextIsChunkedWithOverlap() {
        String text = repeat("Power saving has always been an important research direction in microcontroller design. ", 5000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);

        assertTrue(chunks.size() >= 6, "5000 English chars at leastCutout 6 Block, actual " + chunks.size());
        assertWellFormed(chunks, text);
        for (int i = 1; i < chunks.size(); i++) {
            assertTrue(chunks.get(i).charStart() < chunks.get(i - 1).charEnd(),
                    "No. " + i + " No overlap between block and previous");
        }
    }

    // ---------- breakPointSelect ----------

    @Test
    void prefersParagraphBreakOverHardCut() {
        String head = repeat("this isOneSegmentcontent, About power model. ", 700);
        String tail = repeat("this isTwoSegmentcontent, About experimental results. ", 700);
        String text = head + "\n\n" + tail;

        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertTrue(chunks.size() >= 2);
        // First block should break at blank line, Instead of hard cut at 800 char. 
        assertEquals(head.length(), chunks.get(0).charEnd(),
                "First block should end at paragraph separator");
    }

    @Test
    void prefersSentenceEndWhenNoParagraphBreak() {
        String text = repeat("this isOnea complete sentence. ", 3000);
        List<ChunkingService.Chunk> chunks = service.chunk(text);
        assertWellFormed(chunks, text);
        // Each block should end with period(Except last block may be truncated by text length). 
        for (int i = 0; i < chunks.size() - 1; i++) {
            assertTrue(chunks.get(i).text().endsWith(". "),
                    "No. " + i + " Block not broken at sentence end: ..." + chunks.get(i).text().substring(chunks.get(i).text().length() - 5));
        }
    }

    // ---------- No Breakpoint: infinite loopPreventprotect ----------

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
