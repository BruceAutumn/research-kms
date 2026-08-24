import { requireApiUser } from "../../../lib/api-user";
import { encryptSecret } from "../../../lib/crypto";
import { validateProviderUrl } from "../../../lib/ai";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../lib/runtime";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { providerName?: string; baseUrl?: string; model?: string; apiKey?: string };
    const providerName = body.providerName?.trim().slice(0, 80) || "Custom";
    const baseUrl = validateProviderUrl(body.baseUrl?.trim() || "");
    const model = body.model?.trim().slice(0, 120) || "";
    const apiKey = body.apiKey?.trim() || "";
    if (!model || apiKey.length < 8 || apiKey.length > 500) throw new HttpError(400, "请填写有效的模型 ID 和 API Key。");
    const cipher = await encryptSecret(apiKey);
    const now = new Date().toISOString();
    await productEnv().DB.prepare(`
      INSERT INTO llm_settings (user_id, provider_name, base_url, model, api_key_cipher, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET provider_name=excluded.provider_name,
        base_url=excluded.base_url, model=excluded.model,
        api_key_cipher=excluded.api_key_cipher, updated_at=excluded.updated_at
    `).bind(user.userId, providerName, baseUrl, model, cipher, now).run();
    await audit(user.userId, "model.settings.updated", providerName);
    return Response.json({ providerName, baseUrl, model, hasApiKey: true, updatedAt: now });
  } catch (error) { return routeError(error); }
}
