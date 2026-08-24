import { requireApiUser } from "../../../../../lib/api-user";
import { HttpError, productEnv, routeError } from "../../../../../lib/runtime";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const paper = await productEnv().DB.prepare(
      "SELECT object_key, filename FROM papers WHERE id = ? AND user_id = ?",
    ).bind(id, user.userId).first<{ object_key: string | null; filename: string | null }>();
    if (!paper?.object_key) throw new HttpError(404, "PDF 不存在。");
    const object = await productEnv().FILES.get(paper.object_key);
    if (!object) throw new HttpError(404, "PDF 文件不存在。");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `inline; filename="${(paper.filename || "paper.pdf").replace(/[\r\n"]/g, "_")}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  } catch (error) { return routeError(error); }
}
