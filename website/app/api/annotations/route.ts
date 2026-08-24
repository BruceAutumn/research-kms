import { requireApiUser } from "../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { id?: number; paperId?: number; page?: number; type?: string; color?: string; text?: string; comment?: string; rects?: unknown[] };
    const paperId = Number(body.paperId);
    if (!paperId) throw new HttpError(400, "请选择文献。");
    const paper = await productEnv().DB.prepare("SELECT id FROM papers WHERE id = ? AND user_id = ?").bind(paperId, user.userId).first();
    if (!paper) throw new HttpError(404, "文献不存在。");
    const page = Math.max(1, Math.min(100000, Number(body.page) || 1));
    const type = ["highlight", "underline", "note", "area"].includes(body.type || "") ? body.type! : "highlight";
    const color = ["yellow", "green", "blue", "pink", "purple"].includes(body.color || "") ? body.color! : "yellow";
    const text = body.text?.trim().slice(0, 30_000) || "";
    const comment = body.comment?.trim().slice(0, 30_000) || "";
    if (!text && !comment) throw new HttpError(400, "标注内容不能为空。");
    const rects = JSON.stringify(Array.isArray(body.rects) ? body.rects.slice(0, 100) : []);
    const now = new Date().toISOString();
    if (body.id) {
      const result = await productEnv().DB.prepare(`UPDATE annotations SET page=?, type=?, color=?, text=?, comment=?, rects_json=?, updated_at=?
        WHERE id=? AND paper_id=? AND user_id=?`).bind(page, type, color, text, comment, rects, now, body.id, paperId, user.userId).run();
      if (!result.meta.changes) throw new HttpError(404, "标注不存在。");
      await audit(user.userId, "annotation.updated", String(body.id));
      return Response.json({ id: body.id, paper_id: paperId, page, type, color, text, comment, rects_json: rects, updated_at: now });
    }
    const result = await productEnv().DB.prepare(`INSERT INTO annotations
      (user_id, paper_id, page, type, color, text, comment, rects_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(user.userId, paperId, page, type, color, text, comment, rects, now, now).run();
    await audit(user.userId, "annotation.created", String(paperId));
    return Response.json({ id: result.meta.last_row_id, paper_id: paperId, page, type, color, text, comment, rects_json: rects, created_at: now, updated_at: now }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const id = new URL(request.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "缺少标注 ID。");
    const result = await productEnv().DB.prepare("DELETE FROM annotations WHERE id = ? AND user_id = ?").bind(id, user.userId).run();
    if (!result.meta.changes) throw new HttpError(404, "标注不存在。");
    await audit(user.userId, "annotation.deleted", id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
