import { requireApiUser } from "../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";
import { indexEntity, removeIndexedEntity } from "../../../../lib/search-index";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const { id } = await context.params;
    const body = await request.json() as Record<string, unknown>;
    const current = await productEnv().DB.prepare("SELECT * FROM papers WHERE id = ? AND user_id = ?")
      .bind(id, user.userId).first<Record<string, unknown>>();
    if (!current) throw new HttpError(404, "文献不存在。");
    const revision = Number(body.revision);
    if (!Number.isInteger(revision) || revision < 1) throw new HttpError(428, "更新文献时必须提供 revision。");
    const title = String(body.title ?? current.title ?? "").trim().slice(0, 500);
    if (!title) throw new HttpError(400, "文献标题不能为空。");
    const yearValue = body.year === null || body.year === "" ? null : Number(body.year);
    const result = await productEnv().DB.prepare(`UPDATE papers SET
      title = ?, authors = ?, year = ?, doi = ?, abstract_text = ?, collection_name = ?,
      tags = ?, favorite = ?, reading_progress = ?, revision = revision + 1, updated_at = ?
      WHERE id = ? AND user_id = ? AND revision = ?`).bind(
        title,
        String(body.authors ?? current.authors ?? "").trim().slice(0, 1000) || null,
        body.year === undefined ? current.year : Number.isFinite(yearValue) ? yearValue : null,
        String(body.doi ?? current.doi ?? "").trim().slice(0, 200) || null,
        String(body.abstractText ?? current.abstract_text ?? "").trim().slice(0, 30_000) || null,
        String(body.collectionName ?? current.collection_name ?? "收件箱").trim().slice(0, 120) || "收件箱",
        JSON.stringify(Array.isArray(body.tags) ? body.tags.map(String).map(tag => tag.trim()).filter(Boolean).slice(0, 30) : safeJsonArray(current.tags)),
        body.favorite === undefined ? Number(current.favorite) : body.favorite ? 1 : 0,
        body.readingProgress === undefined ? Number(current.reading_progress) : Math.max(0, Math.min(100, Number(body.readingProgress) || 0)),
        new Date().toISOString(),
        id, user.userId, revision,
      ).run();
    if (!result.meta.changes) {
      const latest = await productEnv().DB.prepare("SELECT id,title,revision,updated_at FROM papers WHERE id=? AND user_id=?").bind(id, user.userId).first();
      if (!latest) throw new HttpError(404, "文献不存在。");
      return Response.json({ error: "文献已在另一窗口更新。", code: "REVISION_CONFLICT", current: latest }, { status: 409 });
    }
    await audit(user.userId, "paper.metadata.updated", title);
    await indexEntity(user.userId, "paper", id, title, `${String(current.extracted_text || "")}\n${String(body.abstractText ?? current.abstract_text ?? "")}\n${String(body.authors ?? current.authors ?? "")}`);
    return Response.json({ id: Number(id), title, revision: revision + 1 });
  } catch (error) { return routeError(error); }
}

function safeJsonArray(value: unknown) {
  try { const parsed = JSON.parse(String(value ?? "[]")); return Array.isArray(parsed) ? parsed : []; }
  catch { return []; }
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
    await productEnv().DB.batch([
      productEnv().DB.prepare("DELETE FROM annotations WHERE paper_id = ? AND user_id = ?").bind(id, user.userId),
      productEnv().DB.prepare("DELETE FROM papers WHERE id = ? AND user_id = ?").bind(id, user.userId),
    ]);
    await audit(user.userId, "paper.deleted", paper.title);
    await removeIndexedEntity(user.userId, "paper", id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}
