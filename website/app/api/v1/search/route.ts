import { requireApiUser } from "../../../../lib/api-user";
import { HttpError, productEnv, routeError } from "../../../../lib/runtime";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser();
    const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 160) || "";
    if (!query) return Response.json({ query, results: [] });
    const match = query.split(/\s+/).map(token => token.replace(/[^\p{L}\p{N}_-]/gu, "")).filter(Boolean).slice(0, 10).map(token => `"${token}"*`).join(" AND ");
    if (!match) throw new HttpError(400, "搜索词无效。");
    const rows = await productEnv().DB.prepare(`SELECT entity_type,entity_id,title,
      snippet(search_index,4,'<mark>','</mark>',' … ',18) AS snippet,
      bm25(search_index) AS score
      FROM search_index WHERE search_index MATCH ? AND user_id=? ORDER BY score LIMIT 60`).bind(match, user.userId).all();
    return Response.json({ query, results: rows.results });
  } catch (error) { return routeError(error); }
}
