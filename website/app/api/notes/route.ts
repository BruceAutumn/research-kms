import { requireApiUser } from "../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { id?: number; title?: string; content?: string };
    const title = body.title?.trim().slice(0, 240) || "";
    const content = body.content?.slice(0, 300_000) ?? "";
    if (!title) throw new HttpError(400, "笔记标题不能为空。");
    const now = new Date().toISOString();
    if (body.id) {
      const result = await productEnv().DB.prepare(
        "UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      ).bind(title, content, now, body.id, user.userId).run();
      if (!result.meta.changes) throw new HttpError(404, "笔记不存在。");
      await audit(user.userId, "note.updated", title);
      return Response.json({ id: body.id, title, content, updated_at: now });
    }
    const result = await productEnv().DB.prepare(`
      INSERT INTO notes (user_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
    `).bind(user.userId, title, content, now, now).run();
    await audit(user.userId, "note.created", title);
    return Response.json({ id: result.meta.last_row_id, title, content, created_at: now, updated_at: now }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "缺少笔记 ID。");
    const result = await productEnv().DB.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").bind(id, user.userId).run();
    if (!result.meta.changes) throw new HttpError(404, "笔记不存在。");
    await audit(user.userId, "note.deleted", id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
