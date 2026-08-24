package com.kms.literature;

import com.kms.common.ApiException;
import com.kms.common.CurrentUser;
import com.kms.literature.dto.AddPapersRequest;
import com.kms.literature.dto.CollectionDto;
import com.kms.literature.dto.CollectionRequest;
import com.kms.literature.dto.ReorderRequest;
import com.kms.paper.dto.PaperDto;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/collections")
public class CollectionController {
    private final CollectionService collectionService;

    public CollectionController(CollectionService collectionService) {
        this.collectionService = collectionService;
    }

    @GetMapping
    public List<CollectionDto> list() {
        return collectionService.list();
    }

    @PostMapping
    public CollectionDto create(@RequestBody CollectionRequest request) {
        return collectionService.create(request);
    }

    @PatchMapping("/{id}")
    public CollectionDto update(@PathVariable Long id, @RequestBody CollectionRequest request) {
        return collectionService.update(id, request);
    }

    @PostMapping("/reorder")
    public void reorder(@RequestBody ReorderRequest request) {
        collectionService.reorder(request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        collectionService.delete(id);
    }

    @GetMapping("/{id}/papers")
    public List<PaperDto> listPapers(@PathVariable Long id) {
        return collectionService.listPapers(id);
    }

    @PostMapping("/{id}/papers")
    public List<PaperDto> addPapers(@PathVariable Long id, @RequestBody AddPapersRequest request) {
        return collectionService.addPapers(id, request.paperIds());
    }

    @DeleteMapping("/{id}/papers/{paperId}")
    public void removePaper(@PathVariable Long id, @PathVariable Long paperId) {
        collectionService.removePaper(id, paperId);
    }
}
