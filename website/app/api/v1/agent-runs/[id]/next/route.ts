import { requireApiUser } from "../../../../../../lib/api-user";
import { decideAgentStep, executeAgentTool, toolDefinition } from "../../../../../../lib/agent";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../../../lib/runtime";

const MAX_TOOL_STEPS = 6;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const db = productEnv().DB;
    const run = await db.prepare(`SELECT id, conversation_id, status, prompt, paper_id, note_id, step_count, answer
      FROM agent_runs WHERE id = ? AND user_id = ?`).bind(id, user.userId).first<Run>();
    if (!run) throw new HttpError(404, "Agent Run 不存在。");
    if (["cancelled", "completed", "approval_required"].includes(run.status)) return runPayload(id, user.userId);
    const steps = await db.prepare(`SELECT tool_name, input_json, output_json, status FROM agent_steps
      WHERE run_id = ? AND user_id = ? ORDER BY sequence`).bind(id, user.userId).all<Step>();
    if (run.step_count >= MAX_TOOL_STEPS) {
      await finish(id, user.userId, run, "已达到工具步骤上限。请缩小任务范围后继续，现有工具结果已安全保留。");
      return runPayload(id, user.userId);
    }
    await db.prepare("UPDATE agent_runs SET status='running', updated_at=? WHERE id=? AND user_id=? AND status IN ('queued','running','error')")
      .bind(new Date().toISOString(), id, user.userId).run();
    const decision = await decideAgentStep(user.userId, {
      prompt: run.prompt,
      paperId: run.paper_id,
      noteId: run.note_id,
      steps: steps.results,
    });
    const stillActive = await db.prepare("SELECT status FROM agent_runs WHERE id=? AND user_id=?").bind(id, user.userId).first<{ status: string }>();
    if (!stillActive || stillActive.status === "cancelled") return runPayload(id, user.userId);
    if (decision.action === "final") {
      await finish(id, user.userId, run, decision.answer);
      return runPayload(id, user.userId);
    }
    const definition = toolDefinition(decision.tool);
    if (!definition) throw new HttpError(400, "工具未注册。");
    const now = new Date().toISOString();
    const sequence = run.step_count + 1;
    if (definition.permission === "write") {
      await db.batch([
        db.prepare(`INSERT INTO agent_steps (run_id,user_id,sequence,tool_name,input_json,status,permission,created_at,updated_at)
          VALUES (?,?,?,?,?,'approval_required','write',?,?)`).bind(id, user.userId, sequence, decision.tool, JSON.stringify(decision.args), now, now),
        db.prepare("UPDATE agent_runs SET status='approval_required', step_count=?, updated_at=? WHERE id=? AND user_id=?")
          .bind(sequence, now, id, user.userId),
      ]);
      return runPayload(id, user.userId, { approval: { tool: decision.tool, input: decision.args, reason: decision.reason, sequence } });
    }
    const output = await executeAgentTool(user.userId, decision.tool, decision.args, { paperId: run.paper_id, noteId: run.note_id });
    const afterTool = await db.prepare("SELECT status FROM agent_runs WHERE id=? AND user_id=?").bind(id, user.userId).first<{ status: string }>();
    if (!afterTool || afterTool.status === "cancelled") return runPayload(id, user.userId);
    await db.batch([
      db.prepare(`INSERT INTO agent_steps (run_id,user_id,sequence,tool_name,input_json,output_json,status,permission,created_at,updated_at)
        VALUES (?,?,?,?,?,?,'completed','read',?,?)`).bind(id, user.userId, sequence, decision.tool, JSON.stringify(decision.args), JSON.stringify(output), now, now),
      db.prepare("UPDATE agent_runs SET status='running', step_count=?, updated_at=? WHERE id=? AND user_id=? AND status!='cancelled'")
        .bind(sequence, now, id, user.userId),
    ]);
    return runPayload(id, user.userId);
  } catch (error) { return routeError(error); }
}

async function finish(id: string, userId: string, run: Run, answer: string) {
  const now = new Date().toISOString();
  const db = productEnv().DB;
  const completed = await db.prepare("UPDATE agent_runs SET status='completed', answer=?, updated_at=? WHERE id=? AND user_id=? AND status!='cancelled'")
    .bind(answer.slice(0, 100_000), now, id, userId).run();
  if (!completed.meta.changes) return;
  await db.batch([
    db.prepare("INSERT INTO ai_messages (user_id,mode,role,content,conversation_id,created_at) VALUES (?,'agent','user',?,?,?)")
      .bind(userId, run.prompt, run.conversation_id, now),
    db.prepare("INSERT INTO ai_messages (user_id,mode,role,content,conversation_id,created_at) VALUES (?,'agent','assistant',?,?,?)")
      .bind(userId, answer.slice(0, 100_000), run.conversation_id, now),
  ]);
  await audit(userId, "agent.completed", id);
}

async function runPayload(id: string, userId: string, extra: Record<string, unknown> = {}) {
  const db = productEnv().DB;
  const run = await db.prepare(`SELECT id, conversation_id, status, prompt, paper_id, note_id, step_count, answer, error_code, created_at, updated_at
    FROM agent_runs WHERE id=? AND user_id=?`).bind(id, userId).first();
  const steps = await db.prepare(`SELECT id, sequence, tool_name, input_json, output_json, status, permission, created_at, updated_at
    FROM agent_steps WHERE run_id=? AND user_id=? ORDER BY sequence`).bind(id, userId).all();
  return Response.json({ run, steps: steps.results, ...extra });
}

type Run = { id: string; conversation_id: string; status: string; prompt: string; paper_id: number | null; note_id: number | null; step_count: number; answer: string | null };
type Step = { tool_name: string; input_json: string; output_json: string | null; status: string };
