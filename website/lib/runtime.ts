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
    return Response.json({ error: error.message }, { status: error.status });
  }
  const message = error instanceof Error ? error.message : "Unexpected error";
  return Response.json({ error: message }, { status: 500 });
}

export function asNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
