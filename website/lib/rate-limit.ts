import { HttpError, productEnv } from "./runtime";

export async function enforceRateLimit(userId: string, bucket: string, limit: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const row = await productEnv().DB.prepare(`INSERT INTO rate_limits (user_id,bucket,window_start,count)
    VALUES (?,?,?,1)
    ON CONFLICT(user_id,bucket) DO UPDATE SET
      window_start=CASE WHEN rate_limits.window_start < excluded.window_start THEN excluded.window_start ELSE rate_limits.window_start END,
      count=CASE WHEN rate_limits.window_start < excluded.window_start THEN 1 ELSE rate_limits.count + 1 END
    RETURNING count,window_start`).bind(userId, bucket, windowStart).first<{ count: number; window_start: number }>();
  if (row && row.count > limit) throw new HttpError(429, `请求过于频繁，请在 ${Math.max(1, row.window_start + windowSeconds - now)} 秒后重试。`);
}
