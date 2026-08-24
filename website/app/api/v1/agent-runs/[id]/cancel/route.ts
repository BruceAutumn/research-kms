import { requireApiUser } from "../../../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../../../lib/runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const now = new Date().toISOString();
    const result = await productEnv().DB.prepare(`UPDATE agent_runs SET status='cancelled',updated_at=?
      WHERE id=? AND user_id=? AND status NOT IN ('completed','cancelled')`).bind(now, id, user.userId).run();
    if (!result.meta.changes) {
      const exists = await productEnv().DB.prepare("SELECT status FROM agent_runs WHERE id=? AND user_id=?").bind(id, user.userId).first();
      if (!exists) throw new HttpError(404, "Agent Run 不存在。");
    }
    await audit(user.userId, "agent.cancelled", id);
    return Response.json({ id, status: "cancelled" });
  } catch (error) { return routeError(error); }
}
