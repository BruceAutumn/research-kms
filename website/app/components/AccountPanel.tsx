"use client";

import { useState } from "react";

export function AccountPanel({ displayName, email }: { displayName: string; email: string }) {
  const [notice, setNotice] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const exportData = async () => {
    setNotice("正在生成导出…");
    const response = await fetch("/api/v1/account/export", { method: "POST" });
    if (!response.ok) return setNotice(await apiMessage(response));
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a"); link.href = url; link.download = `research-kms-export-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    setNotice("导出已下载。模型 API Key 不会包含在导出文件中。");
  };
  const deleteKey = async () => {
    if (!confirm("删除已保存的个人模型 API Key？")) return;
    const response = await fetch("/api/settings", { method: "DELETE" });
    setNotice(response.ok ? "个人模型 API Key 已删除。" : await apiMessage(response));
  };
  const signOutAll = async () => {
    const response = await fetch("/api/v1/account/sessions", { method: "DELETE" });
    if (!response.ok) return setNotice(await apiMessage(response));
    const payload = await response.json() as { signOutUrl: string }; location.href = payload.signOutUrl;
  };
  const deleteAccount = async () => {
    if (confirmation !== "DELETE") return setNotice("请先输入 DELETE。");
    const response = await fetch("/api/v1/account/delete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
    if (!response.ok) return setNotice(await apiMessage(response));
    const payload = await response.json() as { signOutUrl: string }; location.href = payload.signOutUrl;
  };
  return <main className="account-page"><header><a href="/app">← 返回工作区</a><b>Research KMS · 账户</b><a href="/signout-with-chatgpt?return_to=/">退出</a></header><section className="account-layout"><aside><span>{displayName.slice(0, 2).toUpperCase()}</span><h1>{displayName}</h1><p>{email}</p><small>身份登录由统一账号门户管理；Research KMS 不保存你的密码。</small></aside><div className="account-actions">{notice && <div className="app-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}<article><h2>数据与隐私</h2><p>下载文献元数据、标注、Vault 笔记、AI 对话、Agent 步骤、插件清单与审计记录。导出不会包含 API Key 或内部加密材料。</p><button className="solid-action" onClick={() => void exportData()}>导出我的数据</button></article><article><h2>安全与会话</h2><p>个人模型密钥可以立即删除或在模型设置中替换。统一身份会话由账号门户撤销。</p><div className="account-button-row"><button className="secondary-action" onClick={() => void deleteKey()}>删除个人 API Key</button><button className="secondary-action" onClick={() => void signOutAll()}>退出全部设备</button></div></article><article className="danger-zone"><h2>删除账户数据</h2><p>此操作删除产品数据库中的账户资料、文献对象、笔记、对话、Agent 运行和插件配置，无法恢复。</p><label>输入 DELETE 确认<input value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className="danger-button" disabled={confirmation !== "DELETE"} onClick={() => void deleteAccount()}>永久删除账户数据</button></article></div></section></main>;
}

async function apiMessage(response: Response) { try { const value = await response.json() as { error?: string }; return value.error || `请求失败 (${response.status})`; } catch { return `请求失败 (${response.status})`; } }
