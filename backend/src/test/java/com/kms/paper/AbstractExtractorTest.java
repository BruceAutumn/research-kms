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
        String text = "Title\n\nAbstract: This paper proposes a deep learning image classification method, Attention mechanism significantly improved accuracy. " +
                "Experimental results show, This method outperforms mainstream methods on datasets, Accuracy improved by about 5% to 10%. " +
                "besides, This method also excels in efficiency and memory, can run realtime on constrained devicesRun. \n\nKeywords: Deep Learning; Image Classification; Attention Mechanism";
        String result = AbstractExtractor.extract(text);
        assertNotNull(result);
        assertTrue(result.contains("This paper proposes a deep learning image classification method"));
        assertFalse(result.contains("Keywords"));
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