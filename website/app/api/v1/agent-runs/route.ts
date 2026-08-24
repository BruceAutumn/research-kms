import { requireApiUser } from "../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";
import { enforceRateLimit } from "../../../../lib/rate-limit";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await enforceRateLimit(user.userId, "agent-run", 30, 3600);
    const body = await request.json() as { prompt?: string; paperId?: number | null; noteId?: number | null; conversationId?: string };
    const prompt = body.prompt?.trim().slice(0, 12_000) || "";
    if (!prompt) throw new HttpError(400, "请输入 Agent 任务。");
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const conversationId = body.conversationId?.trim().slice(0, 80) || crypto.randomUUID();
    const db = productEnv().DB;
    await db.batch([
      db.prepare(`INSERT INTO conversations (id, user_id, title, archived, created_at, updated_at)
        VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`)
        .bind(conversationId, user.userId, prompt.slice(0, 80), now, now),
      db.prepare(`INSERT INTO agent_runs
        (id, user_id, conversation_id, status, prompt, paper_id, note_id, step_count, created_at, updated_at)
        VALUES (?, ?, ?, 'queued', ?, ?, ?, 0, ?, ?)`)
        .bind(id, user.userId, conversationId, prompt, positiveId(body.paperId), positiveId(body.noteId), now, now),
    ]);
    await audit(user.userId, "agent.created", id);
    return Response.json({ id, conversationId, status: "queued", prompt, steps: [] }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function GET() {
  try {
    const user = await requireApiUser();
    const rows = await productEnv().DB.prepare(`SELECT id, conversation_id, status, prompt, paper_id, note_id, step_count, answer, error_code, created_at, updated_at
      FROM agent_runs WHERE user_id = ? ORDER BY updated_at DESC LIMIT 50`).bind(user.userId).all();
    return Response.json({ runs: rows.results });
  } catch (error) { return routeError(error); }
}

function positiveId(value: unknown) { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
