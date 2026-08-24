package com.kms.literature;

import com.kms.literature.dto.ImportBibtexRequest;
import com.kms.literature.dto.ImportDoiRequest;
import com.kms.literature.dto.ImportResultDto;
import com.kms.paper.dto.PaperDto;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/literature/import")
public class LiteratureController {
    private final LiteratureImportService importService;

    public LiteratureController(LiteratureImportService importService) {
        this.importService = importService;
    }

    @PostMapping("/doi")
    public PaperDto importDoi(@RequestBody ImportDoiRequest request) {
        return importService.importDoi(request.getDoi());
    }

    @PostMapping("/bibtex")
    public ImportResultDto importBibtex(@RequestBody ImportBibtexRequest request) {
        return importService.importBibtex(request.getText());
    }
}
