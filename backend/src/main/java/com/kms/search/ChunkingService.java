package com.kms.search;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Split long text into embed  ParagraphBlock. 
 *
 * why needed: Old impl takes whole pdf_text(longest in vault 73007 char)truncate to 8000 after char
 * Whole embed into a vector, already exceedModelContext, And can only answer"Which roughly relevant". 
 * researchToolwant"Which paragraph covers this", soMustChunk. 
 *
 * rule: 
 *   - targetBlock Length 800 char, Block Overlap 150 char(Chinese by char, token~=char)
 *   - optimizeFirstinParagraph(Blank Line)Or break at sentence punctuation, reallyNot Foundonly hardCut
 *   - strip after shorter than 50 charBlockdirectly discard(fragmentToretrieval is noise)
 */
@Service
public class ChunkingService {

    public static final int CHUNK_CHARS = 800;
    public static final int OVERLAP_CHARS = 150;
    public static final int MIN_CHUNK_CHARS = 50;
    /** to find break near boundaryPoint, max lookback chars.  */
    private static final int BOUNDARY_LOOKBACK = 200;

    private static final String SENTENCE_ENDS = ". ! ? ; .!?;\n";

    /** charStart / charEnd is sameToOriginaltext offset, andand text Field strictly maps(Whitespace trimmed).  */
    public record Chunk(int index, String text, int charStart, int charEnd) {}

    public List<Chunk> chunk(String text) {
        if (text == null || text.isBlank()) return List.of();

        int len = text.length();
        List<Chunk> out = new ArrayList<>();
        int start = 0;
        int index = 0;

        while (start < len) {
            int hardEnd = Math.min(start + CHUNK_CHARS, len);
            int end = hardEnd;
            if (hardEnd < len) {
                int boundary = findBoundary(text, start, hardEnd);
                // breakPointtoo early willBlockCuttoo fine, now ratherCanhardCut. 
                if (boundary > start + MIN_CHUNK_CHARS) end = boundary;
            }

            int s = start;
            int e = end;
            while (s < e && Character.isWhitespace(text.charAt(s))) s++;
            while (e > s && Character.isWhitespace(text.charAt(e - 1))) e--;
            if (e - s >= MIN_CHUNK_CHARS) {
                out.add(new Chunk(index++, text.substring(s, e), s, e));
            }

            if (end >= len) break;
            int next = end - OVERLAP_CHARS;
            // ensure strict advance, else overlap >= Infinite loop when block length. 
            if (next <= start) next = end;
            start = next;
        }
        return out;
    }

    /**
     * in [start, hardEnd) tail lookbackWindowfind break insidePoint, BackbreakPointsubscript after(I.e. block exclusive end). 
     * paragraph break(Blank Line)optimizeFirstat sentence endPoint. Not found returns -1. 
     */
    private int findBoundary(String text, int start, int hardEnd) {
        int floor = Math.max(start + 1, hardEnd - BOUNDARY_LOOKBACK);
        int sentence = -1;
        for (int i = hardEnd - 1; i >= floor; i--) {
            char c = text.charAt(i);
            if (c == '\n' && i > floor && text.charAt(i - 1) == '\n') {
                return i + 1;                       // paragraph break, optimal
            }
            if (sentence < 0 && SENTENCE_ENDS.indexOf(c) >= 0) {
                sentence = i + 1;                   // remember last sentence end
            }
        }
        return sentence;
    }
}
