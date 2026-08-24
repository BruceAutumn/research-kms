import { env } from "cloudflare:workers";
import type { ChatGPTUser } from "../app/chatgpt-auth";

export type ProductEnv = {
  DB: D1Database;
  FILES: R2Bucket;
  APP_ENCRYPTION_KEY?: string;
  ADMIN_EMAIL?: string;
};

export function productEnv(): ProductEnv {
  return env as unknown as ProductEnv;
}

export async function touchProfile(user: ChatGPTUser) {
  const now = new Date().toISOString();
  await productEnv().DB.prepare(`
    INSERT INTO profiles (user_id, email, display_name, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      email = excluded.email,
      display_name = excluded.display_name,
      last_seen_at = excluded.last_seen_at
  `).bind(user.userId, user.email, user.displayName, now, now).run();
}

export async function audit(userId: string | null, action: string, detail?: string) {
  const safeDetail = detail?.slice(0, 500) ?? null;
  await productEnv().DB.prepare(
    "INSERT INTO audit_events (user_id, action, detail, created_at) VALUES (?, ?, ?, ?)",
  ).bind(userId, action, safeDetail, new Date().toISOString()).run();
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) {
    throw new HttpError(403, "Cross-origin write request denied.");
  }
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function routeError(error: unknown) {
  if (error instanceof HttpError) {
    return Response.json({ error: error.message, code: statusCode(error.status), requestId: crypto.randomUUID() }, { status: error.status });
  }
  return Response.json({ error: "服务暂时不可用，请稍后重试。", code: "INTERNAL_ERROR", requestId: crypto.randomUUID() }, { status: 500 });
}

function statusCode(status: number) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "UNAUTHENTICATED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 405) return "METHOD_NOT_ALLOWED";
  if (status === 409) return "REVISION_CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status === 429) return "RATE_LIMITED";
  if (status === 502) return "UPSTREAM_ERROR";
  return "REQUEST_FAILED";
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
