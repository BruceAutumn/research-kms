import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { productEnv } from "../../lib/runtime";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "运营后台" };

export default async function AdminPage() {
  const user = await requireChatGPTUser("/admin");
  const env = productEnv();
  if (!env.ADMIN_EMAIL || user.email.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) {
    return <main className="admin-denied"><h1>403</h1><p>此账户没有运营后台权限。</p><a href="/app">返回工作区</a></main>;
  }
  const db = env.DB;
  const [users, papers, notes, messages, bytes, events] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM profiles").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM papers").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM notes").first<{ count: number }>(),
    db.prepare("SELECT COUNT(*) AS count FROM ai_messages").first<{ count: number }>(),
    db.prepare("SELECT COALESCE(SUM(size_bytes), 0) AS count FROM papers").first<{ count: number }>(),
    db.prepare("SELECT action, detail, created_at FROM audit_events ORDER BY id DESC LIMIT 50").all<Record<string, string>>(),
  ]);
  return <main className="admin-page"><header><a className="brand" href="/app"><span>R</span><b>Research KMS</b></a><div><span>运营后台</span><a href="/app">返回工作区</a></div></header><section className="admin-content"><div className="admin-heading"><span>PRIVATE OPERATIONS</span><h1>系统概览</h1><p>只有站点管理员可访问。用户 API Key 和文献正文不在此处展示。</p></div><div className="metric-grid"><Metric label="用户" value={users?.count || 0} /><Metric label="文献" value={papers?.count || 0} /><Metric label="Vault 笔记" value={notes?.count || 0} /><Metric label="AI 消息" value={messages?.count || 0} /><Metric label="PDF 存储" value={formatBytes(bytes?.count || 0)} /></div><section className="audit-table"><div className="audit-head"><h2>最近审计事件</h2><span>{events.results.length} records</span></div>{events.results.length ? events.results.map((event, index) => <div className="audit-row" key={`${event.created_at}-${index}`}><b>{event.action}</b><span>{event.detail || "—"}</span><time>{new Date(event.created_at).toLocaleString("zh-CN")}</time></div>) : <p className="admin-empty">暂无运行记录。</p>}</section></section></main>;
}

function Metric({ label, value }: { label: string; value: string | number }) { return <article><span>{label}</span><strong>{value}</strong></article>; }
function formatBytes(value: number) { if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`; return `${(value / 1024 / 1024).toFixed(1)} MB`; }
