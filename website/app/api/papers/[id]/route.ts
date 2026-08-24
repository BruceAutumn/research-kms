import { requireApiUser } from "../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title ?? "").trim().slice(0, 500);
    if (!title) throw new HttpError(400, "文献标题不能为空。");
    const yearValue = body.year === null || body.year === "" ? null : Number(body.year);
    const result = await productEnv().DB.prepare(`UPDATE papers SET
      title = ?, authors = ?, year = ?, doi = ?, abstract_text = ?
      WHERE id = ? AND user_id = ?`).bind(
        title,
        String(body.authors ?? "").trim().slice(0, 1000) || null,
        Number.isFinite(yearValue) ? yearValue : null,
        String(body.doi ?? "").trim().slice(0, 200) || null,
        String(body.abstractText ?? "").trim().slice(0, 30_000) || null,
        id, user.userId,
      ).run();
    if (!result.meta.changes) throw new HttpError(404, "文献不存在。");
    await audit(user.userId, "paper.metadata.updated", title);
    return Response.json({ id: Number(id), title });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const paper = await productEnv().DB.prepare(
      "SELECT id, title, object_key FROM papers WHERE id = ? AND user_id = ?",
    ).bind(id, user.userId).first<{ id: number; title: string; object_key: string | null }>();
    if (!paper) throw new HttpError(404, "文献不存在。");
    if (paper.object_key) await productEnv().FILES.delete(paper.object_key);
    await productEnv().DB.prepare("DELETE FROM papers WHERE id = ? AND user_id = ?").bind(id, user.userId).run();
    await audit(user.userId, "paper.deleted", paper.title);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
