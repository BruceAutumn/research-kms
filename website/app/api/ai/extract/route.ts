import { requireApiUser } from "../../../../lib/api-user";
import { modelCompletion, parseJsonObject } from "../../../../lib/ai";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { paperId?: number };
    const paper = await productEnv().DB.prepare(
      "SELECT title, filename, extracted_text FROM papers WHERE id = ? AND user_id = ?",
    ).bind(body.paperId, user.userId).first<{ title: string; filename: string | null; extracted_text: string | null }>();
    if (!paper) throw new HttpError(404, "文献不存在。");
    const text = paper.extracted_text?.trim().slice(0, 60_000) || "";
    if (text.length < 40) throw new HttpError(400, "PDF 可提取文本过少，无法分析元数据。");
    const content = await modelCompletion(user.userId, [
      { role: "system", content: "You extract scholarly metadata. Return only a JSON object with keys title, authors, year, doi, abstractText. authors is a readable string; year is a number or null. Never invent a DOI." },
      { role: "user", content: `Filename: ${paper.filename || paper.title}\n\nDocument text:\n${text}` },
    ]);
    const metadata = parseJsonObject(content);
    await audit(user.userId, "ai.metadata.extracted", String(metadata.title ?? paper.title));
    return Response.json({ metadata });
  } catch (error) { return routeError(error); }
}
