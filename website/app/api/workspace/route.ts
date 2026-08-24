import { requireApiUser } from "../../../lib/api-user";
import { productEnv, routeError } from "../../../lib/runtime";

export async function GET() {
  try {
    const user = await requireApiUser();
    const db = productEnv().DB;
    const [papers, notes, settings, messages] = await Promise.all([
      db.prepare(`SELECT id, title, authors, year, doi, abstract_text, filename, size_bytes, created_at
        FROM papers WHERE user_id = ? ORDER BY created_at DESC LIMIT 200`).bind(user.userId).all(),
      db.prepare(`SELECT id, title, content, created_at, updated_at
        FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 300`).bind(user.userId).all(),
      db.prepare(`SELECT provider_name, base_url, model, updated_at
        FROM llm_settings WHERE user_id = ?`).bind(user.userId).first(),
      db.prepare(`SELECT id, mode, role, content, created_at FROM ai_messages
        WHERE user_id = ? ORDER BY id DESC LIMIT 30`).bind(user.userId).all(),
    ]);
    return Response.json({
      user: { displayName: user.displayName, email: user.email },
      isAdmin: Boolean(productEnv().ADMIN_EMAIL && user.email.toLowerCase() === productEnv().ADMIN_EMAIL?.toLowerCase()),
      papers: papers.results,
      notes: notes.results,
      settings: settings ? { ...settings, hasApiKey: true } : null,
      messages: [...messages.results].reverse(),
    });
  } catch (error) { return routeError(error); }
}
