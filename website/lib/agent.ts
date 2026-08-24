import { modelCompletion } from "./ai";
import { HttpError, productEnv } from "./runtime";
import { indexEntity } from "./search-index";

export type ToolDefinition = {
  name: string;
  permission: "read" | "write";
  description: string;
};

export const AGENT_TOOLS: ToolDefinition[] = [
  { name: "read_paper", permission: "read", description: "读取当前账户文献的元数据、摘要和全文" },
  { name: "list_annotations", permission: "read", description: "读取文献的高亮、下划线、便签和区域标注" },
  { name: "search_library", permission: "read", description: "在当前账户的标题、作者、摘要和 PDF 正文中检索" },
  { name: "read_vault_note", permission: "read", description: "读取当前账户的一篇 Vault 笔记" },
  { name: "search_vault", permission: "read", description: "在当前账户的笔记标题、正文和属性中检索" },
  { name: "write_to_vault", permission: "write", description: "创建一篇 Vault 笔记；执行前必须由用户确认" },
];

export type AgentDecision =
  | { action: "tool"; tool: string; args: Record<string, unknown>; reason: string }
  | { action: "final"; answer: string };

export async function decideAgentStep(userId: string, input: {
  prompt: string;
  paperId: number | null;
  noteId: number | null;
  steps: Array<{ tool_name: string; input_json: string; output_json: string | null; status: string }>;
}): Promise<AgentDecision> {
  const transcript = input.steps.map((step, index) => ({
    sequence: index + 1,
    tool: step.tool_name,
    input: safeJson(step.input_json),
    output: safeJson(step.output_json || "null"),
    status: step.status,
  }));
  const tools = AGENT_TOOLS.map(tool => ({ name: tool.name, permission: tool.permission, description: tool.description }));
  const raw = await modelCompletion(userId, [
    {
      role: "system",
      content: `You are the controller of a research agent. Choose exactly one next action. Return JSON only, without markdown.\nTool action schema: {"action":"tool","tool":"tool_name","args":{},"reason":"short user-facing reason"}.\nFinal schema: {"action":"final","answer":"evidence-based answer in the user's language"}.\nUse only listed tools. Never claim a tool result that is not in the transcript. Prefer read tools before answering. write_to_vault is allowed only when the user's request explicitly asks to create or save a note; the runtime will request approval. Maximum six tool steps.`,
    },
    {
      role: "user",
      content: JSON.stringify({ goal: input.prompt, selectedPaperId: input.paperId, selectedNoteId: input.noteId, tools, transcript }),
    },
  ]);
  const parsed = parseDecision(raw);
  if (parsed.action === "tool" && !AGENT_TOOLS.some(tool => tool.name === parsed.tool)) {
    throw new HttpError(502, "模型请求了未注册工具。");
  }
  return parsed;
}

export async function executeAgentTool(userId: string, name: string, args: Record<string, unknown>, fallback: { paperId: number | null; noteId: number | null; runId?: string }) {
  const db = productEnv().DB;
  if (name === "read_paper") {
    const id = positiveId(args.paperId) ?? fallback.paperId;
    if (!id) throw new HttpError(400, "read_paper 缺少 paperId。");
    const paper = await db.prepare(`SELECT id, title, authors, year, doi, abstract_text, extracted_text, tags, revision
      FROM papers WHERE id = ? AND user_id = ?`).bind(id, userId).first<Record<string, unknown>>();
    if (!paper) throw new HttpError(404, "文献不存在。");
    return { source: { type: "paper", id, title: String(paper.title), detail: "文献元数据与已索引正文" }, paper };
  }
  if (name === "list_annotations") {
    const id = positiveId(args.paperId) ?? fallback.paperId;
    if (!id) throw new HttpError(400, "list_annotations 缺少 paperId。");
    const rows = await db.prepare(`SELECT id, page, type, color, text, comment, rects_json, revision
      FROM annotations WHERE paper_id = ? AND user_id = ? ORDER BY page, id LIMIT 200`).bind(id, userId).all();
    return { paperId: id, count: rows.results.length, annotations: rows.results };
  }
  if (name === "search_library") {
    const query = searchTerm(args.query);
    const like = `%${query}%`;
    const rows = await db.prepare(`SELECT id, title, authors, year, doi, abstract_text
      FROM papers WHERE user_id = ? AND (title LIKE ? OR authors LIKE ? OR doi LIKE ? OR abstract_text LIKE ? OR extracted_text LIKE ?)
      ORDER BY updated_at DESC LIMIT 8`).bind(userId, like, like, like, like, like).all();
    return { query, count: rows.results.length, papers: rows.results };
  }
  if (name === "read_vault_note") {
    const id = positiveId(args.noteId) ?? fallback.noteId;
    if (!id) throw new HttpError(400, "read_vault_note 缺少 noteId。");
    const note = await db.prepare(`SELECT id, stable_id, title, content, folder, properties, revision
      FROM notes WHERE id = ? AND user_id = ?`).bind(id, userId).first<Record<string, unknown>>();
    if (!note) throw new HttpError(404, "笔记不存在。");
    return { source: { type: "note", id, title: String(note.title), detail: "Vault 笔记正文" }, note };
  }
  if (name === "search_vault") {
    const query = searchTerm(args.query);
    const like = `%${query}%`;
    const rows = await db.prepare(`SELECT id, stable_id, title, content, folder, properties, revision
      FROM notes WHERE user_id = ? AND (title LIKE ? OR content LIKE ? OR properties LIKE ?)
      ORDER BY updated_at DESC LIMIT 8`).bind(userId, like, like, like).all();
    return { query, count: rows.results.length, notes: rows.results };
  }
  if (name === "write_to_vault") {
    const title = String(args.title || "").trim().slice(0, 240);
    const content = String(args.content || "").slice(0, 300_000);
    const folder = String(args.folder || "AI").trim().replace(/\.{2,}|[\\]/g, "").slice(0, 180) || "AI";
    if (!title) throw new HttpError(400, "write_to_vault 缺少标题。");
    const now = new Date().toISOString();
    const stableId = crypto.randomUUID();
    const statement = fallback.runId
      ? db.prepare(`INSERT INTO notes
          (user_id, title, content, folder, properties, pinned, stable_id, revision, created_at, updated_at)
          SELECT ?, ?, ?, ?, '{}', 0, ?, 1, ?, ?
          WHERE EXISTS (SELECT 1 FROM agent_runs WHERE id=? AND user_id=? AND status='approval_required')`)
          .bind(userId, title, content, folder, stableId, now, now, fallback.runId, userId)
      : db.prepare(`INSERT INTO notes
          (user_id, title, content, folder, properties, pinned, stable_id, revision, created_at, updated_at)
          VALUES (?, ?, ?, ?, '{}', 0, ?, 1, ?, ?)`)
          .bind(userId, title, content, folder, stableId, now, now);
    const result = await statement.run();
    if (!result.meta.changes) throw new HttpError(409, "Agent 已取消，未写入笔记。");
    const noteId = Number(result.meta.last_row_id);
    await indexEntity(userId, "note", noteId, title, `${folder}\n${content}`);
    return { created: true, noteId, stableId, title, folder, revision: 1 };
  }
  throw new HttpError(400, "工具未注册。");
}

export function toolDefinition(name: string) {
  return AGENT_TOOLS.find(tool => tool.name === name) ?? null;
}

function parseDecision(raw: string): AgentDecision {
  const normalized = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try {
    const value = JSON.parse(normalized) as Record<string, unknown>;
    if (value.action === "tool" && typeof value.tool === "string") {
      return { action: "tool", tool: value.tool, args: isRecord(value.args) ? value.args : {}, reason: String(value.reason || "模型请求调用工具") };
    }
    if (value.action === "final" && typeof value.answer === "string" && value.answer.trim()) {
      return { action: "final", answer: value.answer.trim() };
    }
  } catch { /* fall through and use the model text as a final answer */ }
  return { action: "final", answer: raw.trim() };
}

function safeJson(raw: string) { try { return JSON.parse(raw) as unknown; } catch { return raw; } }
function isRecord(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function positiveId(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function searchTerm(value: unknown) {
  const text = String(value || "").trim().slice(0, 120);
  if (!text) throw new HttpError(400, "搜索词不能为空。");
  return text.replace(/[%_]/g, " ");
}
