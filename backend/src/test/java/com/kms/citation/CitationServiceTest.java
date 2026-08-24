package com.kms.citation;

import com.kms.paper.Paper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Citation generation unit test. pure function logic, exactly what should be tested. 
 * use vaultinRealthat paperPaper Metadataas baseline, Avoid format-data mismatch. 
 *
 * Run: cd backend && mvn -q test -Dtest=CitationServiceTest
 */
class CitationServiceTest {

    private final CitationService service = new CitationService();

    private Paper realPaper() {
        Paper p = new Paper();
        p.setTitle("An Energy-Efficient Strategy for Microcontrollers");
        p.setAuthors("Huanjie Wu, Chun Chen and Kai Weng");
        p.setJournal("Applied Sciences");
        p.setYear(2021);
        p.setVolume("11");
        p.setPages("2581");
        p.setDoi("10.3390/app11062581");
        return p;
    }

    // ---------- Name Parse ----------

    @Test
    void parsesWesternAuthorsSeparatedByCommaAndAnd() {
        List<CitationService.Author> authors = service.parseAuthors("Huanjie Wu, Chun Chen and Kai Weng");
        assertEquals(3, authors.size());
        assertEquals("Wu", authors.get(0).family());
        assertEquals("Huanjie", authors.get(0).given());
        assertEquals("Weng", authors.get(2).family());
    }

    @Test
    void parsesCjkAuthorsWithoutSplittingNames() {
        List<CitationService.Author> authors = service.parseAuthors("Zhang San, Li Si; Wang Wu");
        assertEquals(3, authors.size());
        assertTrue(authors.get(0).cjk());
        // Chinese name cannot be split/Name, even lessAbbreviationinto Three. Zhang
        assertEquals("Zhang San", authors.get(0).family());
        assertEquals("Wang Wu", authors.get(2).family());
    }

    @Test
    void handlesBlankAuthors() {
        assertTrue(service.parseAuthors(null).isEmpty());
        assertTrue(service.parseAuthors("   ").isEmpty());
    }

    // ---------- Each Format ----------

    @Test
    void apaFormat() {
        String out = service.format(realPaper(), CitationService.Style.APA);
        assertTrue(out.startsWith("Wu, H., Chen, C., & Weng, K."), "APA Author segment wrong: " + out);
        assertTrue(out.contains("(2021)."), out);
        assertTrue(out.contains("An Energy-Efficient Strategy for Microcontrollers."), out);
        assertTrue(out.contains("Applied Sciences, 11, 2581."), out);
        assertTrue(out.contains("https://doi.org/10.3390/app11062581"), out);
    }

    @Test
    void ieeeFormat() {
        String out = service.format(realPaper(), CitationService.Style.IEEE);
        assertTrue(out.startsWith("H. Wu, C. Chen, and K. Weng,"), "IEEE Author segment wrong: " + out);
        assertTrue(out.contains("\"An Energy-Efficient Strategy for Microcontrollers,\""), out);
        assertTrue(out.contains("vol. 11"), out);
        assertTrue(out.contains("pp. 2581"), out);
        assertTrue(out.endsWith("2021."), out);
    }

    @Test
    void gbt7714Format() {
        String out = service.format(realPaper(), CitationService.Style.GBT7714);
        assertTrue(out.startsWith("Wu H, Chen C, Weng K."), "GB/T 7714 Author segment wrong: " + out);
        assertTrue(out.contains("[J]."), out);
        assertTrue(out.contains("Applied Sciences, 2021, 11: 2581."), out);
        assertTrue(out.contains("DOI: 10.3390/app11062581."), out);
    }

    @Test
    void gbt7714TruncatesBeyondThreeAuthors() {
        Paper p = realPaper();
        p.setAuthors("A One, B Two, C Three, D Four, E Five");
        String out = service.format(p, CitationService.Style.GBT7714);
        assertTrue(out.contains("etc"), "Over three authors should"etc"truncate: " + out);
    }

    @Test
    void bibtexFormat() {
        String out = service.format(realPaper(), CitationService.Style.BIBTEX);
        assertTrue(out.startsWith("@article{wu2021energy,"), "cite key Wrong: " + out);
        assertTrue(out.contains("author = {Wu, Huanjie and Chen, Chun and Weng, Kai},"), out);
        assertTrue(out.contains("journal = {Applied Sciences},"), out);
        assertTrue(out.contains("year = {2021},"), out);
        assertTrue(out.contains("doi = {10.3390/app11062581},"), out);
        assertTrue(out.trim().endsWith("}"), out);
    }

    // ---------- boundary ----------

    @Test
    void doiStoredAsFullUrlIsNormalized() {
        Paper p = realPaper();
        p.setDoi("https://doi.org/10.3390/app11062581");
        assertTrue(service.format(p, CitationService.Style.APA).contains("https://doi.org/10.3390/app11062581"));
        assertFalse(service.format(p, CitationService.Style.APA).contains("doi.org/https"), "DOI repeatedly concatenated");
        assertTrue(service.format(p, CitationService.Style.BIBTEX).contains("doi = {10.3390/app11062581},"));
    }

    @Test
    void missingFieldsDegradeGracefully() {
        Paper p = new Paper();
        p.setTitle("Untitled Draft");
        // No Author / Year / Journal / DOI should not whenThrow Exception, Should not produce half punctuation
        for (CitationService.Style style : CitationService.Style.values()) {
            String out = service.format(p, style);
            assertNotNull(out);
            assertFalse(out.isBlank(), style + " Output empty");
        }
        assertTrue(service.format(p, CitationService.Style.APA).contains("(n.d.)."));
        assertTrue(service.format(p, CitationService.Style.BIBTEX).contains("@article{anonnd"));
    }

    @Test
    void citeKeySkipsStopWords() {
        Paper p = realPaper();
        // "An" too short, "Energy-Efficient" will beCutinto energy -> wu2021energy
        assertEquals("wu2021energy", service.citeKey(p));
    }

    @Test
    void cjkPaperProducesReadableCitations() {
        Paper p = new Paper();
        p.setTitle("Low-power MCU Design");
        p.setAuthors("Zhang San, Li Si");
        p.setJournal("Journal of Electronics");
        p.setYear(2023);
        String gb = service.format(p, CitationService.Style.GBT7714);
        assertTrue(gb.startsWith("Zhang San, Li Si."), gb);
        assertTrue(gb.contains("Low-power MCU Design[J]. Journal of Electronics, 2023."), gb);
        // Chinese name no abbreviation dot
        assertFalse(gb.contains("Three."), "Chinese name treated as western abbreviation: " + gb);
    }
}
