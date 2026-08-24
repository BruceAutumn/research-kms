import { requireApiUser } from "../../../../../../lib/api-user";
import { executeAgentTool } from "../../../../../../lib/agent";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../../../lib/runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await request.json() as { decision?: "once" | "always" | "reject" };
    const decision = body.decision === "always" ? "always" : body.decision === "once" ? "once" : "reject";
    const db = productEnv().DB;
    const run = await db.prepare("SELECT paper_id,note_id,status FROM agent_runs WHERE id=? AND user_id=?").bind(id, user.userId).first<{ paper_id: number | null; note_id: number | null; status: string }>();
    if (!run) throw new HttpError(404, "Agent Run 不存在。");
    if (run.status !== "approval_required") throw new HttpError(409, "当前 Agent Run 不在待审批状态。");
    const step = await db.prepare(`SELECT id,tool_name,input_json FROM agent_steps
      WHERE run_id=? AND user_id=? AND status='approval_required' ORDER BY sequence DESC LIMIT 1`).bind(id, user.userId).first<{ id: number; tool_name: string; input_json: string }>();
    if (!step) throw new HttpError(409, "没有待审批步骤。");
    const now = new Date().toISOString();
    if (decision === "reject") {
      await db.batch([
        db.prepare("UPDATE agent_steps SET status='rejected',output_json=?,updated_at=? WHERE id=? AND user_id=?").bind(JSON.stringify({ rejected: true }), now, step.id, user.userId),
        db.prepare("UPDATE agent_runs SET status='running',updated_at=? WHERE id=? AND user_id=?").bind(now, id, user.userId),
      ]);
      await audit(user.userId, "agent.approval.rejected", `${id}:${step.tool_name}`);
      return Response.json({ id, status: "running", decision });
    }
    const args = JSON.parse(step.input_json) as Record<string, unknown>;
    const output = await executeAgentTool(user.userId, step.tool_name, args, { paperId: run.paper_id, noteId: run.note_id, runId: id });
    const active = await db.prepare("SELECT status FROM agent_runs WHERE id=? AND user_id=?").bind(id, user.userId).first<{ status: string }>();
    if (!active || active.status === "cancelled") return Response.json({ id, status: "cancelled" });
    await db.batch([
      db.prepare("UPDATE agent_steps SET status='completed',output_json=?,updated_at=? WHERE id=? AND user_id=?")
        .bind(JSON.stringify({ ...output, approval: decision }), now, step.id, user.userId),
      db.prepare("UPDATE agent_runs SET status='running',updated_at=? WHERE id=? AND user_id=?").bind(now, id, user.userId),
    ]);
    await audit(user.userId, `agent.approval.${decision}`, `${id}:${step.tool_name}`);
    return Response.json({ id, status: "running", decision, output });
  } catch (error) { return routeError(error); }
}
