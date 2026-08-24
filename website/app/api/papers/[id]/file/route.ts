import { requireApiUser } from "../../../../../lib/api-user";
import { HttpError, productEnv, routeError } from "../../../../../lib/runtime";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser();
    const { id } = await context.params;
    const paper = await productEnv().DB.prepare(
      "SELECT object_key, filename FROM papers WHERE id = ? AND user_id = ?",
    ).bind(id, user.userId).first<{ object_key: string | null; filename: string | null }>();
    if (!paper?.object_key) throw new HttpError(404, "PDF 不存在。");
    const head = await productEnv().FILES.head(paper.object_key);
    if (!head) throw new HttpError(404, "PDF 文件不存在。");
    const range = parseRange(request.headers.get("range"), head.size);
    const object = await productEnv().FILES.get(paper.object_key, range ? { range } : undefined);
    if (!object) throw new HttpError(404, "PDF 文件不存在。");
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `inline; filename="${(paper.filename || "paper.pdf").replace(/[\r\n"]/g, "_")}"`);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Length", String(range ? range.length : head.size));
    if (range) headers.set("Content-Range", `bytes ${range.offset}-${range.offset + range.length - 1}/${head.size}`);
    return new Response(object.body, { headers, status: range ? 206 : 200 });
  } catch (error) { return routeError(error); }
}

function parseRange(value: string | null, size: number) {
  if (!value) return null;
  const match = /^bytes=(\d+)-(\d*)$/.exec(value.trim());
  if (!match) throw new HttpError(416, "Range 请求无效。");
  const offset = Number(match[1]);
  const end = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isInteger(offset) || !Number.isInteger(end) || offset < 0 || end < offset || offset >= size) throw new HttpError(416, "Range 超出文件范围。");
  return { offset, length: Math.min(end, size - 1) - offset + 1 };
}
