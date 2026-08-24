import { requireApiUser } from "../../../../../lib/api-user";
import { assertSameOrigin, HttpError, productEnv, routeError } from "../../../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { confirmation?: string };
    if (body.confirmation !== "DELETE") throw new HttpError(400, "请输入 DELETE 确认删除账户数据。");
    const db = productEnv().DB;
    const papers = await db.prepare("SELECT object_key FROM papers WHERE user_id=? AND object_key IS NOT NULL").bind(user.userId).all<{ object_key: string }>();
    for (const paper of papers.results) await productEnv().FILES.delete(paper.object_key);
    await db.batch([
      db.prepare("DELETE FROM search_index WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM agent_steps WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM agent_runs WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM ai_messages WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM conversations WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM note_links WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM notes WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM annotations WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM papers WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM plugins WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM llm_settings WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM audit_events WHERE user_id=?").bind(user.userId),
      db.prepare("DELETE FROM profiles WHERE user_id=?").bind(user.userId),
    ]);
    return Response.json({ deleted: true, signOutUrl: "/signout-with-chatgpt?return_to=/" });
  } catch (error) { return routeError(error); }
}
