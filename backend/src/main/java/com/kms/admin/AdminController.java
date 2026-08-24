package com.kms.admin;

import com.kms.paper.PaperService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final PaperService paperService;

    public AdminController(PaperService paperService) {
        this.paperService = paperService;
    }

    @PostMapping("/backfill-abstracts")
    public Map<String, Object> backfillAbstracts() {
        return paperService.backfillAbstracts();
    }
}