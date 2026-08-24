package com.kms.ai;

import com.kms.common.CurrentUser;
import com.kms.literature.Annotation;
import com.kms.literature.AnnotationRepository;
import com.kms.note.Note;
import com.kms.note.NoteRepository;
import com.kms.note.NoteService;
import com.kms.paper.Paper;
import com.kms.paper.PaperRepository;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
public class AiContextService {

    private final PaperRepository paperRepository;
    private final NoteRepository noteRepository;
    private final AnnotationRepository annotationRepository;
    private final NoteService noteService;

    public AiContextService(PaperRepository paperRepository, NoteRepository noteRepository,
                            AnnotationRepository annotationRepository, NoteService noteService) {
        this.paperRepository = paperRepository;
        this.noteRepository = noteRepository;
        this.annotationRepository = annotationRepository;
        this.noteService = noteService;
    }

    public Map<String, Object> resolve(List<Map<String, Object>> refs) {
        List<Map<String, Object>> blocks = new ArrayList<>();
        int totalTokens = 0;
        for (Map<String, Object> ref : refs) {
            String type = (String) ref.get("type");
            Map<String, Object> block = new LinkedHashMap<>();
            block.put("type", type);
            try {
                if ("paper".equals(type)) {
                    Long id = Long.valueOf(ref.get("id").toString());
                    Paper paper = paperRepository.findById(id).orElse(null);
                    if (paper != null) {
                        block.put("id", id);
                        block.put("title", paper.getTitle());
                        String text = buildPaperContext(paper);
                        block.put("text", text);
                        int tokens = text.length() / 4;
                        block.put("tokenEstimate", tokens);
                        totalTokens += tokens;
                    }
                } else if ("note".equals(type)) {
                    Long id = Long.valueOf(ref.get("id").toString());
                    Note note = noteRepository.findById(id).orElse(null);
                    if (note != null) {
                        block.put("id", id);
                        block.put("title", note.getTitle());
                        String text = noteService.getContent(id);
                        block.put("text", text);
                        int tokens = text.length() / 4;
                        block.put("tokenEstimate", tokens);
                        totalTokens += tokens;
                    }
                } else if ("tag".equals(type)) {
                    String tag = (String) ref.get("value");
                    List<Note> tagged = noteRepository.searchByTitleOnly("");
                    block.put("tag", tag);
                    StringBuilder sb = new StringBuilder();
                    for (Note n : tagged) {
                        sb.append("- ").append(n.getTitle()).append("\n");
                    }
                    String text = sb.toString();
                    block.put("text", text);
                    int tokens = text.length() / 4;
                    block.put("tokenEstimate", tokens);
                    totalTokens += tokens;
                } else if ("annotation".equals(type)) {
                    Long id = Long.valueOf(ref.get("id").toString());
                    Annotation ann = annotationRepository.findById(id).orElse(null);
                    if (ann != null) {
                        block.put("id", id);
                        String label = "Annotation #" + id + " (p." + ann.getPage() + ")";
                        block.put("title", label);
                        StringBuilder sb = new StringBuilder();
                        sb.append("[标注 #").append(id).append("]\n");
                        sb.append("论文 ID: ").append(ann.getPaperId()).append("\n");
                        sb.append("页码: ").append(ann.getPage()).append("\n");
                        if (ann.getSelectedText() != null) {
                            sb.append("选中文字: ").append(ann.getSelectedText()).append("\n");
                        }
                        if (ann.getComment() != null && !ann.getComment().isBlank()) {
                            sb.append("用户备注: ").append(ann.getComment()).append("\n");
                        }
                        String text = sb.toString();
                        block.put("text", text);
                        int tokens = text.length() / 4;
                        block.put("tokenEstimate", tokens);
                        totalTokens += tokens;
                    }
                }
            } catch (Exception ignored) {}
            blocks.add(block);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("blocks", blocks);
        result.put("totalTokens", totalTokens);
        return result;
    }

    public Map<String, Object> suggest(String q, String types) {
        List<Map<String, Object>> items = new ArrayList<>();
        if (types == null) types = "paper,note,tag";
        if (types.contains("paper")) {
            for (Paper p : paperRepository.search(CurrentUser.ID, q, null)) {
                items.add(Map.of("type", "paper", "id", p.getId(), "label", p.getTitle()));
            }
        }
        if (types.contains("note")) {
            for (Note n : noteRepository.searchByTitleOnly(q)) {
                items.add(Map.of("type", "note", "id", n.getId(), "label", n.getTitle()));
            }
        }
        return Map.of("items", items);
    }

    private String buildPaperContext(Paper paper) {
        StringBuilder sb = new StringBuilder();
        sb.append("[论文元数据]\n");
        sb.append("标题: ").append(paper.getTitle()).append("\n");
        if (paper.getAuthors() != null) sb.append("作者: ").append(paper.getAuthors()).append("\n");
        if (paper.getJournal() != null) sb.append("期刊: ").append(paper.getJournal()).append("\n");
        if (paper.getYear() != null) sb.append("年份: ").append(paper.getYear()).append("\n");
        if (paper.getDoi() != null) sb.append("DOI: ").append(paper.getDoi()).append("\n");
        if (paper.getAbstractText() != null && !paper.getAbstractText().isBlank()) {
            sb.append("\n[摘要]\n").append(paper.getAbstractText()).append("\n");
        }
        return sb.toString();
    }
}