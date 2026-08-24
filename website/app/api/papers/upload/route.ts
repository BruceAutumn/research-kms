import { requireApiUser } from "../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";
import { indexEntity } from "../../../../lib/search-index";
import { enforceRateLimit } from "../../../../lib/rate-limit";

const MAX_PDF_BYTES = 30 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    await enforceRateLimit(user.userId, "pdf-upload", 20, 3600);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "请选择 PDF 文件。");
    if (file.size <= 0 || file.size > MAX_PDF_BYTES) throw new HttpError(413, "PDF 必须小于 30 MB。");
    const header = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    if (new TextDecoder().decode(header) !== "%PDF-") throw new HttpError(415, "文件不是有效 PDF。");

    const extractedText = String(form.get("extractedText") ?? "").slice(0, 120_000);
    const userHash = await sha256(user.userId);
    const objectKey = `users/${userHash}/papers/${crypto.randomUUID()}.pdf`;
    await productEnv().FILES.put(objectKey, file.stream(), {
      httpMetadata: { contentType: "application/pdf", contentDisposition: `inline; filename="${safeFilename(file.name)}"` },
      customMetadata: { owner: userHash },
    });
    const now = new Date().toISOString();
    const title = file.name.replace(/\.pdf$/i, "").slice(0, 500) || "Untitled paper";
    const result = await (async () => {
      try { return await productEnv().DB.prepare(`
        INSERT INTO papers (user_id, title, extracted_text, filename, object_key, content_type, size_bytes, revision, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'application/pdf', ?, 1, ?, ?)
      `).bind(user.userId, title, extractedText || null, safeFilename(file.name), objectKey, file.size, now, now).run();
      } catch (error) { await productEnv().FILES.delete(objectKey); throw error; }
    })();
    await audit(user.userId, "paper.uploaded", `${title} (${file.size} bytes)`);
    await indexEntity(user.userId, "paper", Number(result.meta.last_row_id), title, extractedText);
    return Response.json({ id: result.meta.last_row_id, title, filename: safeFilename(file.name) }, { status: 201 });
  } catch (error) { return routeError(error); }
}

function safeFilename(name: string) {
  return name.replace(/[\r\n"\\/]/g, "_").slice(0, 180) || "paper.pdf";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
