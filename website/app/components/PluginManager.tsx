"use client";

import { useEffect, useRef, useState } from "react";

type InstalledPlugin = { id: string; name: string; version: string; kind: string; enabled: number; installed_at: string };

export function PluginManager() {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [notice, setNotice] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const refresh = () => fetch("/api/v1/plugins").then(async response => { if (!response.ok) throw new Error(await apiMessage(response)); return response.json() as Promise<{ plugins?: InstalledPlugin[] }>; }).then(value => setPlugins(value.plugins || [])).catch(error => setNotice(error.message));
  useEffect(() => { void refresh(); }, []);
  const install = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      if (file.size > 256 * 1024) throw new Error("Manifest 不能超过 256 KB。");
      const manifest = JSON.parse(await file.text()) as unknown;
      const response = await fetch("/api/v1/plugins", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ manifest }) });
      if (!response.ok) throw new Error(await apiMessage(response));
      setNotice("插件 Manifest 已验证并安装；只授予清单中声明的权限。"); await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Manifest 无效。"); }
    event.target.value = "";
  };
  const remove = async (id: string) => {
    if (!confirm(`移除插件 ${id}？`)) return;
    const response = await fetch(`/api/v1/plugins?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok) return setNotice(await apiMessage(response));
    setNotice("插件已移除。"); await refresh();
  };
  return <section className="settings-card plugin-manager"><header><div><small>SAFE PLUGIN HOST</small><h2>插件</h2></div><button className="secondary-action" onClick={() => inputRef.current?.click()}>导入 JSON Manifest</button></header><p>首版仅允许 http-tool、metadata-source、exporter 和 ui-link。任意 JavaScript、JAR、Shell、数据库访问和非 HTTPS 入口会被拒绝。</p>{notice && <div className="selection-notice" role="status">{notice}</div>}<div className="plugin-list">{plugins.map(plugin => <article key={plugin.id}><div><b>{plugin.name}</b><small>{plugin.id} · {plugin.version} · {plugin.kind}</small></div><span>{plugin.enabled ? "已启用" : "已停用"}</span><button className="danger-link" onClick={() => void remove(plugin.id)}>移除</button></article>)}{!plugins.length && <p>尚未安装插件。</p>}</div><input ref={inputRef} className="sr-only" type="file" accept="application/json,.json" onChange={event => void install(event)} /></section>;
}
async function apiMessage(response: Response) { try { const value = await response.json() as { error?: string }; return value.error || `请求失败 (${response.status})`; } catch { return `请求失败 (${response.status})`; } }
