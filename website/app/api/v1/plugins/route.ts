import { requireApiUser } from "../../../../lib/api-user";
import { assertSameOrigin, audit, HttpError, productEnv, routeError } from "../../../../lib/runtime";

const KINDS = new Set(["http-tool", "metadata-source", "exporter", "ui-link"]);
const PERMISSIONS = new Set(["papers:read", "annotations:read", "notes:read", "metadata:write", "exports:write", "network:https"]);

export async function GET() {
  try {
    const user = await requireApiUser();
    const rows = await productEnv().DB.prepare(`SELECT id,name,version,kind,manifest_json,permissions_json,enabled,installed_at
      FROM plugins WHERE user_id=? ORDER BY installed_at DESC`).bind(user.userId).all();
    return Response.json({ plugins: rows.results });
  } catch (error) { return routeError(error); }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const body = await request.json() as { manifest?: unknown };
    const manifest = validateManifest(body.manifest);
    const digest = await manifestDigest(manifest);
    if (manifest.sha256 && digest !== manifest.sha256.toLowerCase()) throw new HttpError(400, "插件 Manifest 摘要不匹配。");
    const signatureVerified = manifest.signature ? await verifySignature(manifest, digest) : false;
    if (manifest.signature && !signatureVerified) throw new HttpError(400, "插件签名验证失败。");
    const now = new Date().toISOString();
    await productEnv().DB.prepare(`INSERT INTO plugins
      (id,user_id,name,version,kind,manifest_json,permissions_json,enabled,installed_at)
      VALUES (?,?,?,?,?,?,?,1,?)
      ON CONFLICT(user_id,id) DO UPDATE SET name=excluded.name,version=excluded.version,kind=excluded.kind,
      manifest_json=excluded.manifest_json,permissions_json=excluded.permissions_json,enabled=1,installed_at=excluded.installed_at`)
      .bind(manifest.id, user.userId, manifest.name, manifest.version, manifest.kind, JSON.stringify(manifest), JSON.stringify(manifest.permissions), now).run();
    await audit(user.userId, "plugin.installed", `${manifest.id}@${manifest.version}`);
    return Response.json({ plugin: { ...manifest, digest, signatureVerified, enabled: true, installedAt: now } }, { status: 201 });
  } catch (error) { return routeError(error); }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireApiUser();
    const id = new URL(request.url).searchParams.get("id")?.trim() || "";
    if (!id) throw new HttpError(400, "缺少插件 ID。");
    const result = await productEnv().DB.prepare("DELETE FROM plugins WHERE id=? AND user_id=?").bind(id, user.userId).run();
    if (!result.meta.changes) throw new HttpError(404, "插件不存在。");
    await audit(user.userId, "plugin.removed", id);
    return new Response(null, { status: 204 });
  } catch (error) { return routeError(error); }
}

type Manifest = { id: string; name: string; version: string; kind: string; entry: string; permissions: string[]; domains: string[]; sha256?: string; signature?: string; publicKey?: string };

function validateManifest(value: unknown): Manifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new HttpError(400, "Manifest 必须是 JSON 对象。");
  const item = value as Record<string, unknown>;
  const manifest: Manifest = {
    id: String(item.id || "").trim(), name: String(item.name || "").trim().slice(0, 100), version: String(item.version || "").trim(),
    kind: String(item.kind || "").trim(), entry: String(item.entry || "").trim(),
    permissions: Array.isArray(item.permissions) ? item.permissions.map(String) : [], domains: Array.isArray(item.domains) ? item.domains.map(String) : [],
    sha256: item.sha256 ? String(item.sha256) : undefined, signature: item.signature ? String(item.signature) : undefined, publicKey: item.publicKey ? String(item.publicKey) : undefined,
  };
  if (!/^[a-z0-9][a-z0-9.-]{2,79}$/.test(manifest.id)) throw new HttpError(400, "插件 ID 格式无效。");
  if (!manifest.name || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version)) throw new HttpError(400, "插件名称或语义化版本无效。");
  if (!KINDS.has(manifest.kind)) throw new HttpError(400, "插件类型不在首版白名单中。");
  if (manifest.permissions.some(permission => !PERMISSIONS.has(permission))) throw new HttpError(400, "Manifest 请求了不允许的权限。");
  let entry: URL;
  try { entry = new URL(manifest.entry); } catch { throw new HttpError(400, "插件入口必须是有效 HTTPS URL。"); }
  if (entry.protocol !== "https:" || entry.username || entry.password) throw new HttpError(400, "插件入口必须使用无凭据 HTTPS。");
  const domains = manifest.domains.map(domain => domain.toLowerCase().trim()).filter(Boolean);
  if (!domains.length || !domains.some(domain => entry.hostname === domain || (domain.startsWith("*.") && entry.hostname.endsWith(domain.slice(1))))) throw new HttpError(400, "插件入口不在域名白名单中。");
  if (manifest.signature && (!manifest.publicKey || !manifest.sha256)) throw new HttpError(400, "签名插件必须同时提供 publicKey 和 sha256。");
  if (manifest.sha256 && !/^[a-fA-F0-9]{64}$/.test(manifest.sha256)) throw new HttpError(400, "sha256 格式无效。");
  return { ...manifest, domains };
}

async function manifestDigest(manifest: Manifest) {
  const canonical = JSON.stringify(Object.fromEntries(Object.entries(manifest).filter(([key]) => !["sha256", "signature", "publicKey"].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function verifySignature(manifest: Manifest, digest: string) {
  try {
    const key = await crypto.subtle.importKey("raw", fromBase64(manifest.publicKey!), { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "Ed25519" }, key, fromBase64(manifest.signature!), new TextEncoder().encode(digest));
  } catch { return false; }
}
function fromBase64(value: string) { const raw = atob(value); return Uint8Array.from(raw, character => character.charCodeAt(0)); }
