import { decryptSecret } from "./crypto";
import { HttpError, productEnv } from "./runtime";

type StoredSettings = {
  provider_name: string;
  base_url: string;
  model: string;
  protocol: string;
  api_key_cipher: string;
};

export async function getModelSettings(userId: string): Promise<StoredSettings> {
  const row = await productEnv().DB.prepare(
    "SELECT provider_name, base_url, model, protocol, api_key_cipher FROM llm_settings WHERE user_id = ?",
  ).bind(userId).first<StoredSettings>();
  if (!row) throw new HttpError(409, "请先在模型设置中保存 API Key 和模型。");
  return row;
}

export function validateProviderUrl(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new HttpError(400, "Base URL 格式不正确。"); }
  if (url.protocol !== "https:") throw new HttpError(400, "模型 Base URL 必须使用 HTTPS。");
  if (url.username || url.password || (url.port && url.port !== "443")) {
    throw new HttpError(400, "Base URL 不能包含账号信息或非标准端口。");
  }
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" || host.endsWith(".local") || host === "::1" ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) throw new HttpError(400, "Base URL 不能指向本机或内网地址。");
  return url.toString().replace(/\/$/, "");
}

export async function modelCompletion(userId: string, messages: Array<{ role: string; content: string }>) {
  const settings = await getModelSettings(userId);
  const apiKey = await decryptSecret(settings.api_key_cipher);
  const base = validateProviderUrl(settings.base_url);
  if (settings.protocol === "anthropic") return anthropicCompletion(base, settings.model, apiKey, messages);
  const endpoint = base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model: settings.model, messages, temperature: 0.2, stream: false }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
    throw new HttpError(502, `模型服务返回 ${response.status}: ${detail}`);
  }
  const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) throw new HttpError(502, "模型没有返回可用内容。");
  return content;
}

async function anthropicCompletion(base: string, model: string, apiKey: string, messages: Array<{ role: string; content: string }>) {
  const endpoint = base.endsWith("/messages") ? base : `${base}/messages`;
  const system = messages.filter(message => message.role === "system").map(message => message.content).join("\n\n");
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, system, max_tokens: 4096, temperature: 0.2, messages: messages.filter(message => message.role !== "system") }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300).replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]");
    throw new HttpError(502, `模型服务返回 ${response.status}: ${detail}`);
  }
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const content = payload.content?.filter(block => block.type === "text").map(block => block.text || "").join("\n").trim();
  if (!content) throw new HttpError(502, "模型没有返回可用内容。");
  return content;
}

export function parseJsonObject(raw: string): Record<string, unknown> {
  const normalized = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  try { return JSON.parse(normalized) as Record<string, unknown>; }
  catch { throw new HttpError(502, "模型返回的元数据不是有效 JSON，请重试。"); }
}
