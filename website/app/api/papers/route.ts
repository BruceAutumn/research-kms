import { requireApiUser } from "../../../lib/api-user";
import { asNumber, assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as Record<string, unknown>;
    const title = String(body.title ?? "").trim().slice(0, 500);
    if (!title) throw new HttpError(400, "文献标题不能为空。");
    const now = new Date().toISOString();
    const result = await productEnv().DB.prepare(`
      INSERT INTO papers (user_id, title, authors, year, doi, abstract_text, extracted_text, filename, object_key, content_type, size_bytes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0, ?)
    `).bind(
      user.userId, title, String(body.authors ?? "").trim().slice(0, 1000) || null,
      asNumber(body.year), String(body.doi ?? "").trim().slice(0, 200) || null,
      String(body.abstractText ?? "").trim().slice(0, 30_000) || null,
      String(body.extractedText ?? "").trim().slice(0, 120_000) || null, now,
    ).run();
    await audit(user.userId, "paper.created", title);
    return Response.json({ id: result.meta.last_row_id }, { status: 201 });
  } catch (error) { return routeError(error); }
}
