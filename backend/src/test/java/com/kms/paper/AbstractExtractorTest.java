package com.kms.paper;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class AbstractExtractorTest {

    @Test
    void testStandardAbstractKeywords() {
        String text = "Some header text\n\nAbstract: Power saving has always been an important research direction in the field of microcontrollers. " +
                "This paper proposes a novel strategy that combines dynamic voltage scaling with sleep time optimization.\n\n" +
                "Keywords: microcontroller, energy efficiency, power saving";
        String result = AbstractExtractor.extract(text);
        assertNotNull(result);
        assertTrue(result.startsWith("Power saving"));
        assertTrue(result.contains("sleep time optimization"));
        assertFalse(result.contains("Keywords"));
    }

    @Test
    void testChineseAbstract() {
        String text = "标题\n\n摘要：本文提出了一种基于深度学习的图像分类方法，通过引入注意力机制显著提升了分类准确率。" +
                "实验结果表明，该方法在多个标准数据集上均优于现有的主流方法，准确率提升了约百分之五到百分之十。" +
                "此外，该方法在计算效率和内存占用方面也具有显著优势，能够在资源受限的嵌入式设备上实时运行。\n\n关键词：深度学习；图像分类；注意力机制";
        String result = AbstractExtractor.extract(text);
        assertNotNull(result);
        assertTrue(result.contains("本文提出了一种基于深度学习的图像分类方法"));
        assertFalse(result.contains("关键词"));
    }

    @Test
    void testHyphenatedLineBreak() {
        String text = "Abstract: This paper studies micro-\ncontrollers and their energy consumption patterns in real-time systems " +
                "with various workloads and scheduling strategies applied to embedded devices.\n\nKeywords: test";
        String result = AbstractExtractor.extract(text);
        assertNotNull(result);
        assertTrue(result.contains("microcontrollers"));
        assertFalse(result.contains("micro-\n"));
    }

    @Test
    void testNoAbstractKeyword() {
        String text = "This is a paper without an abstract section. It just has some random text that goes on for a while. " +
                "There is no keyword called abstract anywhere in this text portion of the document.";
        String result = AbstractExtractor.extract(text);
        assertNull(result);
    }

    @Test
    void testTooShort() {
        String text = "Abstract: Too short.\n\nKeywords: test";
        String result = AbstractExtractor.extract(text);
        assertNull(result);
    }

    @Test
    void testTooLong() {
        StringBuilder sb = new StringBuilder("Abstract: ");
        for (int i = 0; i < 10000; i++) sb.append("word ");
        sb.append("\n\nKeywords: test");
        String result = AbstractExtractor.extract(sb.toString());
        assertNull(result);
    }
}