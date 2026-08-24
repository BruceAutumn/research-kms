package com.kms.citation;

import com.kms.common.ApiException;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import com.kms.paper.PaperService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 引文与参考文献接口。
 * 补上 Zotero 最核心而本项目此前完全没有的一环：读完能直接引用。
 */
@RestController
@RequestMapping("/api/citations")
public class CitationController {

    private final CitationService citationService;
    private final PaperService paperService;
    private final PaperRepository paperRepository;

    public CitationController(CitationService citationService, PaperService paperService,
                              PaperRepository paperRepository) {
        this.citationService = citationService;
        this.paperService = paperService;
        this.paperRepository = paperRepository;
    }

    private CitationService.Style parseStyle(String style) {
        String key = style == null ? "apa" : style.trim().toLowerCase(Locale.ROOT).replace("-", "").replace("/", "");
        return switch (key) {
            case "apa" -> CitationService.Style.APA;
            case "ieee" -> CitationService.Style.IEEE;
            case "gbt7714", "gb", "gbt", "gb7714" -> CitationService.Style.GBT7714;
            case "bibtex", "bib" -> CitationService.Style.BIBTEX;
            default -> throw new ApiException(HttpStatus.BAD_REQUEST,
                    "不支持的引文格式: " + style + "（可用 apa / ieee / gbt7714 / bibtex）");
        };
    }

    /** 单篇引文。style 默认 apa。 */
    @GetMapping("/{paperId}")
    public Map<String, Object> one(@PathVariable Long paperId,
                                   @RequestParam(required = false, defaultValue = "apa") String style) {
        Paper paper = paperService.findPaper(paperId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("paperId", paperId);
        result.put("style", style);
        result.put("citeKey", citationService.citeKey(paper));
        result.put("text", citationService.format(paper, parseStyle(style)));
        return result;
    }

    /** 一次拿全部格式，供前端「复制引文」下拉直接用，省得点一次请求一次。 */
    @GetMapping("/{paperId}/all")
    public Map<String, Object> all(@PathVariable Long paperId) {
        Paper paper = paperService.findPaper(paperId);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("paperId", paperId);
        result.put("citeKey", citationService.citeKey(paper));
        for (CitationService.Style style : CitationService.Style.values()) {
            result.put(style.name().toLowerCase(Locale.ROOT), citationService.format(paper, style));
        }
        return result;
    }

    /**
     * 批量导出 .bib。ids 为空则导出全部未删除文献 —— 对应「把整个文库丢给 LaTeX」这个场景。
     */
    @GetMapping(value = "/bibtex", produces = "text/plain; charset=UTF-8")
    public String bibtex(@RequestParam(required = false) List<Long> ids) {
        List<Paper> papers = (ids == null || ids.isEmpty())
                ? paperRepository.findAll().stream().filter(p -> !p.isTrashed()).toList()
                : ids.stream().map(paperService::findPaper).toList();
        return papers.stream()
                .map(p -> citationService.format(p, CitationService.Style.BIBTEX))
                .collect(Collectors.joining("\n\n"));
    }
}
