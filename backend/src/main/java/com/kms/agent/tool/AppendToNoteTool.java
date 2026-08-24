package com.kms.agent.tool;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.kms.agent.PermissionKey;
import com.kms.agent.ToolContext;
import com.kms.agent.ToolResult;
import com.kms.note.NoteService;
import org.springframework.stereotype.Component;

@Component
public class AppendToNoteTool extends AbstractJsonTool {
    private final NoteService noteService;

    public AppendToNoteTool(NoteService noteService, ObjectMapper objectMapper) {
        super(objectMapper);
        this.noteService = noteService;
    }

    @Override public String name() { return "append-to-note"; }
    @Override public String displayName() { return "追加到笔记"; }
    @Override public String category() { return "Vault"; }
    @Override public String description() { return "向已有笔记追加内容到指定章节末尾。"; }
    @Override public boolean isWriteOperation() { return true; }
    @Override public PermissionKey permissionKey() { return PermissionKey.MODIFY_NOTE; }

    @Override
    public JsonNode parameterSchema() {
        ObjectNode s = schema();
        prop(s, "note_id", "integer", "笔记 ID");
        prop(s, "section", "string", "章节标题（如 ## Summary）");
        prop(s, "content", "string", "要追加的内容");
        required(s, "note_id", "content");
        return s;
    }

    @Override
    public ToolResult execute(ToolContext ctx, JsonNode args) {
        long noteId = longArg(args, "note_id");
        String section = strArg(args, "section");
        String content = strArg(args, "content");
        var note = noteService.findNote(noteId);
        String oldContent = note.getContent();
        String newContent;
        if (!section.isBlank()) {
            int idx = oldContent.indexOf(section);
            if (idx >= 0) {
                int nextSection = oldContent.indexOf("\n## ", idx + section.length());
                int insertPos = nextSection >= 0 ? nextSection : oldContent.length();
                newContent = oldContent.substring(0, insertPos) + "\n" + content + oldContent.substring(insertPos);
            } else {
                newContent = oldContent + "\n\n" + section + "\n" + content;
            }
        } else {
            newContent = oldContent + "\n\n" + content;
        }
        noteService.updateContent(noteId, newContent);
        return ToolResult.of(objectMapper.createObjectNode().put("noteId", noteId).put("appended", true));
    }
}