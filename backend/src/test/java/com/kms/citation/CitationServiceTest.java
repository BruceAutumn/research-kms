package com.kms.citation;

import com.kms.paper.Paper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.*;

/**
 * 引文生成单元测试。纯函数逻辑，正是最该被测试覆盖的部分。
 * 用库里真实那篇论文的元数据做基准，避免测出来的格式和实际数据对不上。
 *
 * 运行：cd backend && mvn -q test -Dtest=CitationServiceTest
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

    // ---------- 姓名解析 ----------

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
        List<CitationService.Author> authors = service.parseAuthors("张三、李四; 王五");
        assertEquals(3, authors.size());
        assertTrue(authors.get(0).cjk());
        // 中文姓名不能被拆成姓/名，更不能缩写成 三. 张
        assertEquals("张三", authors.get(0).family());
        assertEquals("王五", authors.get(2).family());
    }

    @Test
    void handlesBlankAuthors() {
        assertTrue(service.parseAuthors(null).isEmpty());
        assertTrue(service.parseAuthors("   ").isEmpty());
    }

    // ---------- 各格式 ----------

    @Test
    void apaFormat() {
        String out = service.format(realPaper(), CitationService.Style.APA);
        assertTrue(out.startsWith("Wu, H., Chen, C., & Weng, K."), "APA 作者段不对: " + out);
        assertTrue(out.contains("(2021)."), out);
        assertTrue(out.contains("An Energy-Efficient Strategy for Microcontrollers."), out);
        assertTrue(out.contains("Applied Sciences, 11, 2581."), out);
        assertTrue(out.contains("https://doi.org/10.3390/app11062581"), out);
    }

    @Test
    void ieeeFormat() {
        String out = service.format(realPaper(), CitationService.Style.IEEE);
        assertTrue(out.startsWith("H. Wu, C. Chen, and K. Weng,"), "IEEE 作者段不对: " + out);
        assertTrue(out.contains("\"An Energy-Efficient Strategy for Microcontrollers,\""), out);
        assertTrue(out.contains("vol. 11"), out);
        assertTrue(out.contains("pp. 2581"), out);
        assertTrue(out.endsWith("2021."), out);
    }

    @Test
    void gbt7714Format() {
        String out = service.format(realPaper(), CitationService.Style.GBT7714);
        assertTrue(out.startsWith("Wu H, Chen C, Weng K."), "GB/T 7714 作者段不对: " + out);
        assertTrue(out.contains("[J]."), out);
        assertTrue(out.contains("Applied Sciences, 2021, 11: 2581."), out);
        assertTrue(out.contains("DOI: 10.3390/app11062581."), out);
    }

    @Test
    void gbt7714TruncatesBeyondThreeAuthors() {
        Paper p = realPaper();
        p.setAuthors("A One, B Two, C Three, D Four, E Five");
        String out = service.format(p, CitationService.Style.GBT7714);
        assertTrue(out.contains("等"), "超过三名作者应以「等」截断: " + out);
    }

    @Test
    void bibtexFormat() {
        String out = service.format(realPaper(), CitationService.Style.BIBTEX);
        assertTrue(out.startsWith("@article{wu2021energy,"), "cite key 不对: " + out);
        assertTrue(out.contains("author = {Wu, Huanjie and Chen, Chun and Weng, Kai},"), out);
        assertTrue(out.contains("journal = {Applied Sciences},"), out);
        assertTrue(out.contains("year = {2021},"), out);
        assertTrue(out.contains("doi = {10.3390/app11062581},"), out);
        assertTrue(out.trim().endsWith("}"), out);
    }

    // ---------- 边界 ----------

    @Test
    void doiStoredAsFullUrlIsNormalized() {
        Paper p = realPaper();
        p.setDoi("https://doi.org/10.3390/app11062581");
        assertTrue(service.format(p, CitationService.Style.APA).contains("https://doi.org/10.3390/app11062581"));
        assertFalse(service.format(p, CitationService.Style.APA).contains("doi.org/https"), "DOI 被重复拼接了");
        assertTrue(service.format(p, CitationService.Style.BIBTEX).contains("doi = {10.3390/app11062581},"));
    }

    @Test
    void missingFieldsDegradeGracefully() {
        Paper p = new Paper();
        p.setTitle("Untitled Draft");
        // 没有作者 / 年份 / 期刊 / DOI 时不该抛异常，也不该拼出半截的标点
        for (CitationService.Style style : CitationService.Style.values()) {
            String out = service.format(p, style);
            assertNotNull(out);
            assertFalse(out.isBlank(), style + " 输出为空");
        }
        assertTrue(service.format(p, CitationService.Style.APA).contains("(n.d.)."));
        assertTrue(service.format(p, CitationService.Style.BIBTEX).contains("@article{anonnd"));
    }

    @Test
    void citeKeySkipsStopWords() {
        Paper p = realPaper();
        // "An" 太短、"Energy-Efficient" 会被切成 energy -> wu2021energy
        assertEquals("wu2021energy", service.citeKey(p));
    }

    @Test
    void cjkPaperProducesReadableCitations() {
        Paper p = new Paper();
        p.setTitle("低功耗单片机设计");
        p.setAuthors("张三、李四");
        p.setJournal("电子学报");
        p.setYear(2023);
        String gb = service.format(p, CitationService.Style.GBT7714);
        assertTrue(gb.startsWith("张三, 李四."), gb);
        assertTrue(gb.contains("低功耗单片机设计[J]. 电子学报, 2023."), gb);
        // 中文名不能出现缩写点
        assertFalse(gb.contains("三."), "中文姓名被当成西文缩写了: " + gb);
    }
}
