package com.kms.note;

import com.kms.note.dto.NotePreviewRequest;
import com.kms.note.dto.NotePreviewResult;
import com.kms.note.dto.NoteTemplateDto;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/note-templates")
public class NoteTemplateController {

    private final NoteTemplateService service;

    public NoteTemplateController(NoteTemplateService service) {
        this.service = service;
    }

    @GetMapping
    public List<NoteTemplateDto> list(@RequestParam(required = false) String scope) {
        return service.list(scope);
    }

    @GetMapping("/{id}")
    public NoteTemplateDto get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public NoteTemplateDto create(@RequestBody NoteTemplateDto dto) {
        return service.create(dto);
    }

    @PutMapping("/{id}")
    public NoteTemplateDto update(@PathVariable Long id, @RequestBody NoteTemplateDto dto) {
        return service.update(id, dto);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    @PostMapping("/{id}/set-default")
    public NoteTemplateDto setDefault(@PathVariable Long id) {
        return service.setDefault(id);
    }
}