import { requireApiUser } from "../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../lib/runtime";
import { indexEntity, removeIndexedEntity } from "../../../lib/search-index";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { id?: number; revision?: number; title?: string; content?: string; folder?: string; properties?: Record<string, unknown>; pinned?: boolean };
    const title = body.title?.trim().slice(0, 240) || "";
    const content = body.content?.slice(0, 300_000) ?? "";
    const folder = body.folder?.trim().replace(/\.{2,}|[\\]/g, "").slice(0, 180) || "Inbox";
    const properties = JSON.stringify(body.properties && typeof body.properties === "object" ? body.properties : {});
    const pinned = body.pinned ? 1 : 0;
    if (!title) throw new HttpError(400, "笔记标题不能为空。");
    const now = new Date().toISOString();
    if (body.id) {
      const revision = Number(body.revision);
      if (!Number.isInteger(revision) || revision < 1) throw new HttpError(428, "保存已有笔记时必须提供 revision。");
      const result = await productEnv().DB.prepare(
        "UPDATE notes SET title = ?, content = ?, folder = ?, properties = ?, pinned = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?",
      ).bind(title, content, folder, properties, pinned, now, body.id, user.userId, revision).run();
      if (!result.meta.changes) {
        const current = await productEnv().DB.prepare("SELECT id,stable_id,title,content,folder,properties,pinned,revision,updated_at FROM notes WHERE id=? AND user_id=?")
          .bind(body.id, user.userId).first();
        if (!current) throw new HttpError(404, "笔记不存在。");
        return Response.json({ error: "笔记已在另一窗口更新。", code: "REVISION_CONFLICT", current }, { status: 409 });
      }
      await audit(user.userId, "note.updated", title);
      await indexEntity(user.userId, "note", body.id, title, `${content}\n${properties}`);
      return Response.json({ id: body.id, title, content, folder, properties, pinned, revision: revision + 1, updated_at: now });
    }
    const stableId = crypto.randomUUID();
    const result = await productEnv().DB.prepare(`
      INSERT INTO notes (user_id, title, content, folder, properties, pinned, stable_id, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).bind(user.userId, title, content, folder, properties, pinned, stableId, now, now).run();
    await audit(user.userId, "note.created", title);
    await indexEntity(user.userId, "note", Number(result.meta.last_row_id), title, `${content}\n${properties}`);
    return Response.json({ id: result.meta.last_row_id, stable_id: stableId, title, content, folder, properties, pinned, revision: 1, created_at: now, updated_at: now }, { status: 201 });
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
    await removeIndexedEntity(user.userId, "note", id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
