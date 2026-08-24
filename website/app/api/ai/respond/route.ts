import { requireApiUser } from "../../../../lib/api-user";
import { modelCompletion } from "../../../../lib/ai";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { prompt?: string; mode?: string; paperId?: number | null; noteId?: number | null };
    const prompt = body.prompt?.trim().slice(0, 12_000) || "";
    const mode = body.mode === "agent" ? "agent" : body.mode === "plan" ? "plan" : "chat";
    if (!prompt) throw new HttpError(400, "请输入问题。");
    const db = productEnv().DB;
    const steps: Array<{ name: string; detail: string; status: string }> = [];
    const sources: Array<{ type: string; id: number; title: string; detail: string }> = [];
    let context = "";
    if (body.paperId) {
      const paper = await db.prepare(`SELECT title, authors, year, doi, abstract_text, extracted_text
        FROM papers WHERE id = ? AND user_id = ?`).bind(body.paperId, user.userId).first<Record<string, unknown>>();
      if (paper) {
        context += `\nPAPER:\n${JSON.stringify(paper)}\n`;
        steps.push({ name: "read_paper", detail: String(paper.title), status: "completed" });
        sources.push({ type: "paper", id: Number(body.paperId), title: String(paper.title), detail: "文献全文与元数据" });
        const annotations = await db.prepare("SELECT page, type, text, comment FROM annotations WHERE paper_id = ? AND user_id = ? ORDER BY page LIMIT 100")
          .bind(body.paperId, user.userId).all();
        if (annotations.results.length) {
          context += `\nANNOTATIONS:\n${JSON.stringify(annotations.results)}\n`;
          steps.push({ name: "list_annotations", detail: `${annotations.results.length} annotations`, status: "completed" });
        }
      }
    }
    if (body.noteId) {
      const note = await db.prepare("SELECT title, content FROM notes WHERE id = ? AND user_id = ?")
        .bind(body.noteId, user.userId).first<{ title: string; content: string }>();
      if (note) {
        context += `\nVAULT NOTE: ${note.title}\n${note.content.slice(0, 40_000)}\n`;
        steps.push({ name: "read_vault_note", detail: note.title, status: "completed" });
        sources.push({ type: "note", id: Number(body.noteId), title: note.title, detail: "Vault 笔记正文" });
      }
    }
    if (mode === "agent") {
      const keyword = prompt.split(/\s+/).find(part => part.length >= 3)?.slice(0, 40) || prompt.slice(0, 40);
      const related = await db.prepare("SELECT title, content FROM notes WHERE user_id = ? AND (title LIKE ? OR content LIKE ?) LIMIT 5")
        .bind(user.userId, `%${keyword}%`, `%${keyword}%`).all();
      if (related.results.length) context += `\nRELATED NOTES:\n${JSON.stringify(related.results)}\n`;
      steps.push({ name: "search_vault", detail: `${related.results.length} related notes`, status: "completed" });
    }
    const answer = await modelCompletion(user.userId, [
      { role: "system", content: mode === "agent" ? "You are a research agent. Work step by step with the provided tools and context. Distinguish evidence from inference. Cite supplied sources with [^1], [^2] in their listed order. Never claim a tool was used if no trace is provided." : mode === "plan" ? "You are in read-only planning mode. Analyze the goal and produce a concise numbered plan with risks and evidence needs. Do not claim to execute, modify, upload, or call tools. Cite supplied sources with [^1], [^2]." : "You are a careful research assistant. Answer in the user's language. Cite supplied sources with [^1], [^2] in their listed order and never claim access to material not in context." },
      { role: "user", content: `${prompt}\n\nAVAILABLE CONTEXT:${context || " No paper or note selected."}` },
    ]);
    const now = new Date().toISOString();
    await db.batch([
      db.prepare("INSERT INTO ai_messages (user_id, mode, role, content, created_at) VALUES (?, ?, 'user', ?, ?)").bind(user.userId, mode, prompt, now),
      db.prepare("INSERT INTO ai_messages (user_id, mode, role, content, created_at) VALUES (?, ?, 'assistant', ?, ?)").bind(user.userId, mode, answer.slice(0, 100_000), now),
    ]);
    await audit(user.userId, `ai.${mode}.completed`, `paper=${body.paperId || "none"}, note=${body.noteId || "none"}`);
    return Response.json({ answer, steps, sources });
  } catch (error) { return routeError(error); }
}
