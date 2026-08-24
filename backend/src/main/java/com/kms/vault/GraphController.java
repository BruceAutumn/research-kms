package com.kms.vault;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/** 关系图谱数据接口：Global Graph / Local Graph（depth 1–3）。 */
@RestController
@RequestMapping("/api/graph")
public class GraphController {

    private final GraphService graphService;

    public GraphController(GraphService graphService) {
        this.graphService = graphService;
    }

    @GetMapping("/global")
    public Map<String, Object> global() {
        return graphService.global();
    }

    @GetMapping("/local")
    public Map<String, Object> local(@RequestParam("path") String path,
                                     @RequestParam(value = "depth", defaultValue = "1") int depth) {
        return graphService.local(path, depth);
    }
}
