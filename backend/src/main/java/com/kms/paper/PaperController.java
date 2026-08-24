package com.kms.paper;

import com.kms.note.NoteService;
import com.kms.note.NoteTemplateService;
import com.kms.note.dto.NoteDto;
import com.kms.literature.Annotation;
import com.kms.literature.AnnotationService;
import com.kms.literature.dto.AnnotationRequest;
import com.kms.paper.dto.ExtractResponse;
import com.kms.paper.dto.MetadataDto;
import com.kms.paper.dto.MetadataSaveResult;
import com.kms.paper.dto.PaperDto;
import com.kms.paper.dto.PaperUpdateRequest;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import com.kms.citation.CitationService;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

@RestController
@RequestMapping("/api/papers")
public class PaperController {
    private final CitationService citationService;
    private final PaperService paperService;
    private final NoteService noteService;
    private final NoteTemplateService noteTemplateService;
    private final AnnotationService annotationService;

    public PaperController(PaperService paperService, NoteService noteService, NoteTemplateService noteTemplateService, AnnotationService annotationService, CitationService citationService) {
        this.citationService = citationService;
        this.paperService = paperService;
        this.noteService = noteService;
        this.noteTemplateService = noteTemplateService;
        this.annotationService = annotationService;
    }

    @PostMapping("/upload")
    public PaperDto upload(@RequestParam("file") MultipartFile file) {
        return paperService.upload(file);
    }

    @GetMapping
    public List<PaperDto> list(@RequestParam(required = false) String q,
                               @RequestParam(required = false) String tag,
                               @RequestParam(required = false) String filter) {
        return paperService.search(q, tag, filter);
    }

    @GetMapping("/{id}")
    public PaperDto get(@PathVariable Long id) {
        return paperService.get(id);
    }

    @PatchMapping("/{id}")
    public PaperDto update(@PathVariable Long id, @RequestBody PaperUpdateRequest request) {
        return paperService.update(id, request);
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        paperService.delete(id);
    }

    @GetMapping(value = "/{id}/file", produces = MediaType.APPLICATION_PDF_VALUE)
    public ResponseEntity<?> file(@PathVariable Long id, @RequestHeader HttpHeaders headers) throws IOException {
        UrlResource resource = paperService.getPdfResource(id);
        long length = resource.contentLength();
        if (headers.getRange().isEmpty()) {
            return ResponseEntity.ok()
                    .contentType(MediaType.APPLICATION_PDF)
                    .contentLength(length)
                    .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                    .body(resource);
        }
        // pdfjs will use HTTP Range Paginated Request PDF. Spring   ResourceRegion in some
        // application/pdf no in sceneAvailable converter, so thisinexplicit parse Range, Back byte[]. 
        // thus logic clearer, Also more suitable v1 Learn the project by reading. 
        var range = headers.getRange().getFirst();
        long start = range.getRangeStart(length);
        long end = range.getRangeEnd(length);
        long rangeLength = end - start + 1;
        byte[] bytes = readRange(resource.getFile().toPath(), start, rangeLength);
        return ResponseEntity.status(HttpStatus.PARTIAL_CONTENT)
                .contentType(MediaType.APPLICATION_PDF)
                .contentLength(rangeLength)
                .header(HttpHeaders.ACCEPT_RANGES, "bytes")
                .header(HttpHeaders.CONTENT_RANGE, "bytes " + start + "-" + end + "/" + length)
                .body(bytes);
    }

    private byte[] readRange(Path path, long start, long rangeLength) throws IOException {
        if (rangeLength > Integer.MAX_VALUE) {
            rangeLength = Integer.MAX_VALUE;
        }
        byte[] bytes = new byte[(int) rangeLength];
        try (InputStream inputStream = Files.newInputStream(path)) {
            inputStream.skipNBytes(start);
            int offset = 0;
            while (offset < bytes.length) {
                int read = inputStream.read(bytes, offset, bytes.length - offset);
                if (read == -1) break;
                offset += read;
            }
            if (offset == bytes.length) {
                return bytes;
            }
            byte[] truncated = new byte[offset];
            System.arraycopy(bytes, 0, truncated, 0, offset);
            return truncated;
        }
    }

    @PostMapping("/{id}/opened")
    public PaperDto markOpened(@PathVariable Long id) {
        return paperService.markOpened(id);
    }

    @GetMapping("/{id}/related")
    public List<PaperDto> related(@PathVariable Long id) {
        return paperService.related(id);
    }

    @GetMapping("/{id}/metadata")
    public List<MetadataDto> getMetadata(@PathVariable Long id) {
        return paperService.getMetadata(id);
    }

    @PutMapping("/{id}/metadata")
    public MetadataSaveResult replaceMetadata(@PathVariable Long id, @RequestBody List<MetadataDto> fields) {
        return paperService.replaceMetadata(id, fields);
    }

    /** Zotero styleReadingtriage: Mark Read/Reading/Unread, Star.  */
    @PatchMapping("/{id}/reading-state")
    public PaperDto updateReadingState(@PathVariable Long id, @RequestBody ReadingStateRequest request) {
        return paperService.updateReadingState(id, request.readStatus(), request.rating());
    }

    public record ReadingStateRequest(String readStatus, Integer rating) {}

    @PostMapping("/{id}/extract")
    public ExtractResponse extract(@PathVariable Long id) {
        return paperService.extractMetadata(id);
    }

    @PostMapping("/{id}/note")
    public NoteDto createNote(@PathVariable Long id, @RequestBody(required = false) com.kms.note.dto.CreatePaperNoteRequest request) {
        if (request != null && request.content() != null && !request.content().isBlank()) {
            return noteService.createFromPaperWithContent(id, request);
        }
        return noteService.createFromPaper(id);
    }

    @GetMapping("/{id}/notes")
    public List<NoteDto> listNotes(@PathVariable Long id) {
        return noteService.listByPaper(id);
    }

    @PostMapping("/{id}/note/preview")
    public com.kms.note.dto.NotePreviewResult previewNote(@PathVariable Long id,
                                                          @RequestBody com.kms.note.dto.NotePreviewRequest request) {
        boolean resolveAi = request.resolveAi() != null && request.resolveAi();
        return noteTemplateService.preview(id, request.templateId(), resolveAi);
    }

    @GetMapping("/{id}/annotations")
    public List<Annotation> listAnnotations(@PathVariable Long id) {
        return annotationService.list(id);
    }

    @PostMapping("/{id}/annotations")
    public Annotation createAnnotation(@PathVariable Long id, @RequestBody AnnotationRequest request) {
        request.setPaperId(id);
        return annotationService.create(request);
    }

    @PostMapping("/{id}/annotations/export-to-note")
    public NoteDto exportAnnotationsToNote(@PathVariable Long id, @RequestBody java.util.Map<String, Object> body) {
        List<Annotation> annotations = annotationService.list(id);
        Long noteId = body.get("noteId") != null ? Long.valueOf(body.get("noteId").toString()) : null;
        StringBuilder sb = new StringBuilder("\n\n## My Annotations\n\n");
        // Zotero  Behavior: Annotation export to note auto with citation, Else citations must be hand-copied. 
        // style Caller specified, Default APA. 
        Paper citedPaper = paperService.findPaper(id);
        String citationStyle = body.get("citationStyle") == null ? "apa" : body.get("citationStyle").toString();
        boolean withCitation = !"none".equalsIgnoreCase(citationStyle);
        if (withCitation) {
            CitationService.Style style = switch (citationStyle.toLowerCase(java.util.Locale.ROOT)) {
                case "ieee" -> CitationService.Style.IEEE;
                case "gbt7714", "gb", "gbt" -> CitationService.Style.GBT7714;
                case "bibtex", "bib" -> CitationService.Style.BIBTEX;
                default -> CitationService.Style.APA;
            };
            sb.append("> ").append(citationService.format(citedPaper, style)).append("\n\n");
        }
        for (Annotation a : annotations) {
            sb.append("> ").append(a.getSelectedText() != null ? a.getSelectedText() : "").append("\n");
            // ^ann-N Compat Obsidian Block Reference; [[paper:..#ann-..]] is in-appCanparsed back-jumpLink, 
            // without it"Bidirectional Jump"onlyGono return. 
            sb.append("> -- p.").append(a.getPage()).append(" ^ann-").append(a.getId())
              .append(" [[paper:").append(id).append("#ann-").append(a.getId()).append("]]\n");
            if (a.getComment() != null && !a.getComment().isBlank()) sb.append("\n").append(a.getComment()).append("\n");
            sb.append("\n");
        }
        if (noteId != null) {
            com.kms.note.dto.CreatePaperNoteRequest req = new com.kms.note.dto.CreatePaperNoteRequest(
                sb.toString(), "", null, "APPEND");
            return noteService.createFromPaperWithContent(id, req);
        }
        com.kms.note.dto.CreatePaperNoteRequest req = new com.kms.note.dto.CreatePaperNoteRequest(
            sb.toString(), "", "annotations-export.md", "DUPLICATE");
        return noteService.createFromPaperWithContent(id, req);
    }
}
