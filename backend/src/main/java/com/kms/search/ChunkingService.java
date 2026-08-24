package com.kms.search;

import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * 把长文本切成可 embed 的段落块。
 *
 * 为什么需要：原实现把整篇 pdf_text（本库最长 73007 字符）截断到 8000 字符后
 * 整体 embed 成一个向量，既超模型上下文，又只能回答「哪篇大概相关」。
 * 研究工具要的是「哪一段讲了这个」，所以必须切块。
 *
 * 规则：
 *   - 目标块长 800 字符，块间重叠 150 字符（中文按字符计，token≈char）
 *   - 优先在段落（空行）或句末标点处断开，实在找不到才硬切
 *   - strip 后短于 50 字符的块直接丢弃（碎片对检索是噪声）
 */
@Service
public class ChunkingService {

    public static final int CHUNK_CHARS = 800;
    public static final int OVERLAP_CHARS = 150;
    public static final int MIN_CHUNK_CHARS = 50;
    /** 为了在边界附近找断点，最多向前回看的字符数。 */
    private static final int BOUNDARY_LOOKBACK = 200;

    private static final String SENTENCE_ENDS = "。！？；.!?;\n";

    /** charStart / charEnd 是相对原文的偏移，且与 text 字段严格对应（已去掉首尾空白）。 */
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
                // 断点太靠前会把块切得过碎，此时宁可硬切。
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
            // 保证严格前进，否则重叠量 >= 块长时会死循环。
            if (next <= start) next = end;
            start = next;
        }
        return out;
    }

    /**
     * 在 [start, hardEnd) 尾部回看窗口内找断点，返回断点之后的下标（即块的 exclusive end）。
     * 段落断（空行）优先于句末标点。找不到返回 -1。
     */
    private int findBoundary(String text, int start, int hardEnd) {
        int floor = Math.max(start + 1, hardEnd - BOUNDARY_LOOKBACK);
        int sentence = -1;
        for (int i = hardEnd - 1; i >= floor; i--) {
            char c = text.charAt(i);
            if (c == '\n' && i > floor && text.charAt(i - 1) == '\n') {
                return i + 1;                       // 段落断，最优
            }
            if (sentence < 0 && SENTENCE_ENDS.indexOf(c) >= 0) {
                sentence = i + 1;                   // 记住最靠后的句末
            }
        }
        return sentence;
    }
}
