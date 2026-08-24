import { requireApiUser } from "../../../../../../lib/api-user";
import { assertSameOrigin, HttpError, productEnv, routeError } from "../../../../../../lib/runtime";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const result = await productEnv().DB.prepare(`UPDATE agent_runs SET status='running',error_code=NULL,updated_at=?
      WHERE id=? AND user_id=? AND status IN ('error','paused')`).bind(new Date().toISOString(), id, user.userId).run();
    if (!result.meta.changes) throw new HttpError(409, "此 Agent Run 当前不能恢复。");
    return Response.json({ id, status: "running" });
  } catch (error) { return routeError(error); }
}
