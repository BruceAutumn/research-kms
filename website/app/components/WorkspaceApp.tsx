"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

type Paper = {
  id: number; title: string; authors: string | null; year: number | null;
  doi: string | null; abstract_text: string | null; filename: string | null;
  size_bytes: number; created_at: string;
};
type Note = { id: number; title: string; content: string; created_at: string; updated_at: string };
type AiMessage = { id: number; mode: string; role: "user" | "assistant"; content: string; created_at: string };
type Settings = { provider_name: string; base_url: string; model: string; updated_at: string; hasApiKey: boolean } | null;
type Workspace = {
  user: { displayName: string; email: string }; isAdmin: boolean;
  papers: Paper[]; notes: Note[]; settings: Settings; messages: AiMessage[];
};
type ToolStep = { name: string; detail: string; status: string };
type Tab = "library" | "ai" | "vault" | "settings";

const PROVIDERS = {
  DeepSeek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat" },
  OpenAI: { baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini" },
  OpenRouter: { baseUrl: "https://openrouter.ai/api/v1", model: "deepseek/deepseek-chat-v3.1" },
  Custom: { baseUrl: "https://", model: "" },
};

export function WorkspaceApp() {
  const [data, setData] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw new Error(await apiMessage(response));
    const workspace = await response.json() as Workspace;
    setData(workspace);
    setSelectedPaperId(current => current ?? workspace.papers[0]?.id ?? null);
    setSelectedNoteId(current => current ?? workspace.notes[0]?.id ?? null);
  };

  useEffect(() => { refresh().catch(error => setNotice(error.message)); }, []);

  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "操作失败，请稍后重试。"); }
    finally { setBusy(""); }
  };

  const uploadPdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await run("upload", async () => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("请选择 PDF 文件。");
      if (file.size > 30 * 1024 * 1024) throw new Error("PDF 必须小于 30 MB。");
      const extractedText = await extractPdfText(file);
      const form = new FormData(); form.set("file", file); form.set("extractedText", extractedText);
      const response = await fetch("/api/papers/upload", { method: "POST", body: form });
      if (!response.ok) throw new Error(await apiMessage(response));
      const created = await response.json() as { id: number };
      await refresh(); setSelectedPaperId(created.id); setNotice("PDF 已上传，可在 AI Studio 提取元数据。");
    });
    event.target.value = "";
  };

  if (!data) return <div className="app-loading"><span className="app-logo">R</span><p>{notice || "正在打开你的研究工作区…"}</p></div>;
  const selectedPaper = data.papers.find(paper => paper.id === selectedPaperId) ?? null;
  const selectedNote = data.notes.find(note => note.id === selectedNoteId) ?? null;

  return (
    <div className="product-app">
      <header className="product-topbar">
        <a className="product-brand" href="/"><span>R</span><b>Research KMS</b></a>
        <div className="product-search">⌕ 搜索文献、笔记与对话</div>
        <div className="product-user"><span>{initials(data.user.displayName)}</span><div><b>{data.user.displayName}</b><small>{data.user.email}</small></div><a href="/signout-with-chatgpt?return_to=/">退出</a></div>
      </header>
      <div className="product-shell">
        <nav className="product-nav" aria-label="工作区导航">
          <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}><i>▤</i>文献库</button>
          <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}><i>✦</i>AI Studio</button>
          <button className={tab === "vault" ? "active" : ""} onClick={() => setTab("vault")}><i>◇</i>知识库</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><i>⚙</i>模型设置</button>
          {data.isAdmin && <a className="admin-entry" href="/admin">后台管理</a>}
          <div className="nav-spacer" />
          <small>你的内容按账户隔离保存</small>
        </nav>
        <main className="product-content">
          {notice && <div className="app-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
          {tab === "library" && <LibraryPanel data={data} selected={selectedPaper} selectedId={selectedPaperId} setSelected={setSelectedPaperId} onUpload={() => fileRef.current?.click()} uploadPdf={uploadPdf} fileRef={fileRef} busy={busy} refresh={refresh} run={run} />}
          {tab === "ai" && <AiPanel data={data} selectedPaperId={selectedPaperId} setSelectedPaperId={setSelectedPaperId} selectedNoteId={selectedNoteId} setSelectedNoteId={setSelectedNoteId} busy={busy} run={run} refresh={refresh} />}
          {tab === "vault" && <VaultPanel notes={data.notes} selected={selectedNote} selectedId={selectedNoteId} setSelected={setSelectedNoteId} busy={busy} run={run} refresh={refresh} />}
          {tab === "settings" && <SettingsPanel settings={data.settings} busy={busy} run={run} refresh={refresh} />}
        </main>
      </div>
    </div>
  );
}

function LibraryPanel({ data, selected, selectedId, setSelected, onUpload, uploadPdf, fileRef, busy, run, refresh }: {
  data: Workspace; selected: Paper | null; selectedId: number | null; setSelected: (id: number) => void;
  onUpload: () => void; uploadPdf: (event: React.ChangeEvent<HTMLInputElement>) => void; fileRef: React.RefObject<HTMLInputElement | null>;
  busy: string; run: (label: string, action: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>;
}) {
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  useEffect(() => setMetadata(null), [selectedId]);
  const extract = () => selected && run("extract", async () => {
    const response = await jsonFetch("/api/ai/extract", { paperId: selected.id });
    setMetadata(response.metadata as Record<string, unknown>);
  });
  const saveMetadata = () => selected && metadata && run("metadata", async () => {
    const response = await fetch(`/api/papers/${selected.id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify(metadata) });
    if (!response.ok) throw new Error(await apiMessage(response));
    await refresh(); setMetadata(null);
  });
  const remove = () => selected && confirm(`删除“${selected.title}”？`) && run("delete-paper", async () => {
    const response = await fetch(`/api/papers/${selected.id}`, { method: "DELETE" });
    if (!response.ok) throw new Error(await apiMessage(response));
    setSelected(data.papers.find(p => p.id !== selected.id)?.id ?? 0); await refresh();
  });
  return <section className="module-grid library-module">
    <aside className="module-list">
      <div className="module-list-head"><div><small>LIBRARY</small><h1>我的文献</h1></div><button className="icon-action" onClick={onUpload} title="上传 PDF">＋</button></div>
      <input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={uploadPdf} />
      <button className="upload-drop" onClick={onUpload} disabled={busy === "upload"}><b>{busy === "upload" ? "正在解析…" : "上传 PDF"}</b><small>自动读取文本，最大 30 MB</small></button>
      <div className="item-list">{data.papers.map(paper => <button key={paper.id} className={paper.id === selectedId ? "active" : ""} onClick={() => setSelected(paper.id)}><span className="doc-icon">PDF</span><span><b>{paper.title}</b><small>{paper.authors || paper.filename || "待提取元数据"}</small></span></button>)}</div>
      {!data.papers.length && <Empty title="还没有文献" text="上传第一份 PDF，即可阅读并用 AI 提取元数据。" />}
    </aside>
    <div className="paper-viewer">
      {selected?.filename ? <iframe title={selected.title} src={`/api/papers/${selected.id}/file#view=FitH`} /> : <Empty title="选择一份 PDF" text="文献原文件只对当前登录账户开放。" />}
    </div>
    <aside className="metadata-panel">
      {selected ? <><div className="panel-heading"><div><small>METADATA</small><h2>文献资料</h2></div></div>
        <dl className="metadata-list"><dt>标题</dt><dd>{String(metadata?.title ?? selected.title)}</dd><dt>作者</dt><dd>{String(metadata?.authors ?? selected.authors ?? "—")}</dd><dt>年份</dt><dd>{String(metadata?.year ?? selected.year ?? "—")}</dd><dt>DOI</dt><dd>{String(metadata?.doi ?? selected.doi ?? "—")}</dd><dt>摘要</dt><dd className="abstract-value">{String(metadata?.abstractText ?? selected.abstract_text ?? "尚未提取")}</dd></dl>
        <button className="solid-action" onClick={extract} disabled={Boolean(busy)}>{busy === "extract" ? "AI 正在阅读…" : "✦ 用 AI 提取元数据"}</button>
        {metadata && <button className="secondary-action" onClick={saveMetadata} disabled={Boolean(busy)}>确认并写入</button>}
        <button className="danger-link" onClick={remove} disabled={Boolean(busy)}>删除文献</button>
      </> : <Empty title="文献资料" text="上传或选择文献后在此查看。" />}
    </aside>
  </section>;
}

function AiPanel({ data, selectedPaperId, setSelectedPaperId, selectedNoteId, setSelectedNoteId, busy, run, refresh }: {
  data: Workspace; selectedPaperId: number | null; setSelectedPaperId: (id: number | null) => void;
  selectedNoteId: number | null; setSelectedNoteId: (id: number | null) => void; busy: string;
  run: (label: string, action: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"chat" | "agent">("chat");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [steps, setSteps] = useState<ToolStep[]>([]);
  const send = (event: FormEvent) => { event.preventDefault(); if (!prompt.trim()) return; run("ai", async () => {
    const result = await jsonFetch("/api/ai/respond", { prompt, mode, paperId: selectedPaperId, noteId: selectedNoteId });
    setReply(String(result.answer)); setSteps((result.steps || []) as ToolStep[]); setPrompt(""); await refresh();
  }); };
  return <section className="ai-workspace">
    <header className="module-header"><div><small>AI STUDIO</small><h1>与研究资料一起思考</h1></div><div className="mode-switch"><button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>Chat</button><button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>Agent</button></div></header>
    <div className="context-bar"><label>文献<select value={selectedPaperId ?? ""} onChange={event => setSelectedPaperId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用</option>{data.papers.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label><label>笔记<select value={selectedNoteId ?? ""} onChange={event => setSelectedNoteId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用</option>{data.notes.map(n => <option value={n.id} key={n.id}>{n.title}</option>)}</select></label><span>{data.settings ? `${data.settings.provider_name} · ${data.settings.model}` : "请先配置模型 API"}</span></div>
    <div className="chat-stage">
      {!reply && !data.messages.length && <Empty title={mode === "agent" ? "Agent 会按步骤调用你的资料" : "开始一次研究对话"} text="选择文献或笔记作为上下文，然后输入问题。" />}
      {data.messages.slice(-8).map(message => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? "你" : "AI"}</small><p>{message.content}</p></article>)}
      {steps.length > 0 && <div className="tool-trace"><b>工具轨迹</b>{steps.map((step, index) => <div key={`${step.name}-${index}`}><span>✓</span><code>{step.name}</code><small>{step.detail}</small></div>)}</div>}
      {reply && <article className="chat-message assistant latest"><small>本次回答</small><p>{reply}</p></article>}
    </div>
    <form className="chat-composer" onSubmit={send}><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={mode === "agent" ? "让 Agent 阅读、检索并整理…" : "询问这份文献或笔记…"} /><button disabled={busy === "ai" || !data.settings}>{busy === "ai" ? "处理中" : "发送 ↗"}</button></form>
  </section>;
}

function VaultPanel({ notes, selected, selectedId, setSelected, busy, run, refresh }: {
  notes: Note[]; selected: Note | null; selectedId: number | null; setSelected: (id: number | null) => void; busy: string;
  run: (label: string, action: () => Promise<void>) => Promise<void>; refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(selected?.title ?? ""); const [content, setContent] = useState(selected?.content ?? "");
  useEffect(() => { setTitle(selected?.title ?? ""); setContent(selected?.content ?? ""); }, [selected]);
  const backlinks = useMemo(() => selected ? notes.filter(note => note.id !== selected.id && wikiLinks(note.content).includes(selected.title)) : [], [notes, selected]);
  const outgoing = wikiLinks(content);
  const save = () => run("note", async () => {
    if (!title.trim()) throw new Error("请填写笔记标题。");
    const response = await fetch("/api/notes", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id: selected?.id, title, content }) });
    if (!response.ok) throw new Error(await apiMessage(response));
    const saved = await response.json() as Note; await refresh(); setSelected(saved.id);
  });
  const create = () => { setSelected(null); setTitle("未命名笔记"); setContent("# 未命名笔记\n\n使用 [[另一篇笔记]] 创建双向链接。"); };
  const remove = () => selected && confirm(`删除“${selected.title}”？`) && run("delete-note", async () => {
    const response = await fetch(`/api/notes?id=${selected.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await apiMessage(response));
    setSelected(notes.find(note => note.id !== selected.id)?.id ?? null); await refresh();
  });
  return <section className="module-grid vault-module">
    <aside className="module-list"><div className="module-list-head"><div><small>VAULT</small><h1>知识库</h1></div><button className="icon-action" onClick={create}>＋</button></div><div className="item-list note-items">{notes.map(note => <button key={note.id} className={note.id === selectedId ? "active" : ""} onClick={() => setSelected(note.id)}><span className="note-icon">◇</span><span><b>{note.title}</b><small>{new Date(note.updated_at).toLocaleDateString()}</small></span></button>)}</div>{!notes.length && <Empty title="从一条笔记开始" text="笔记支持 Markdown 与 [[WikiLink]]。" />}</aside>
    <div className="note-editor"><input value={title} onChange={event => setTitle(event.target.value)} aria-label="笔记标题" placeholder="笔记标题" /><textarea value={content} onChange={event => setContent(event.target.value)} aria-label="Markdown 笔记正文" placeholder="写下你的研究想法…" /><div className="editor-actions"><button className="solid-action" onClick={save} disabled={Boolean(busy)}>{busy === "note" ? "保存中…" : "保存笔记"}</button>{selected && <button className="danger-link" onClick={remove}>删除</button>}<small>支持 Markdown 与 [[双向链接]]</small></div></div>
    <aside className="link-panel"><small>LINKED THINKING</small><h2>关系</h2><section><b>链接到</b>{outgoing.length ? outgoing.map(link => <span key={link}>→ {link}</span>) : <p>尚无 WikiLink</p>}</section><section><b>反向链接</b>{backlinks.length ? backlinks.map(note => <button key={note.id} onClick={() => setSelected(note.id)}>← {note.title}</button>) : <p>尚无反向链接</p>}</section><section><b>知识图谱</b><div className="mini-graph"><i /><i /><i /><i /></div></section></aside>
  </section>;
}

function SettingsPanel({ settings, busy, run, refresh }: { settings: Settings; busy: string; run: (label: string, action: () => Promise<void>) => Promise<void>; refresh: () => Promise<void> }) {
  const initialProvider = settings?.provider_name && settings.provider_name in PROVIDERS ? settings.provider_name : "DeepSeek";
  const [provider, setProvider] = useState(initialProvider); const [baseUrl, setBaseUrl] = useState(settings?.base_url ?? PROVIDERS.DeepSeek.baseUrl);
  const [model, setModel] = useState(settings?.model ?? PROVIDERS.DeepSeek.model); const [apiKey, setApiKey] = useState("");
  const changeProvider = (value: string) => { setProvider(value); const preset = PROVIDERS[value as keyof typeof PROVIDERS]; if (preset) { setBaseUrl(preset.baseUrl); setModel(preset.model); } };
  const submit = (event: FormEvent) => { event.preventDefault(); run("settings", async () => {
    const response = await fetch("/api/settings", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ providerName: provider, baseUrl, model, apiKey }) });
    if (!response.ok) throw new Error(await apiMessage(response)); setApiKey(""); await refresh();
  }); };
  return <section className="settings-page"><header className="module-header"><div><small>MODEL SETTINGS</small><h1>连接你的 AI 模型</h1><p>API Key 仅在服务端加密保存，不会返回浏览器。</p></div></header><form className="settings-card" onSubmit={submit}><label>模型服务商<select value={provider} onChange={event => changeProvider(event.target.value)}>{Object.keys(PROVIDERS).map(name => <option key={name}>{name}</option>)}</select></label><label>兼容 API 地址<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required /><small>仅接受公网 HTTPS 地址，私网地址会被拒绝。</small></label><label>模型 ID<input value={model} onChange={event => setModel(event.target.value)} placeholder="deepseek-chat" required /></label><label>个人 API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" placeholder={settings?.hasApiKey ? "已安全保存；输入新 Key 可替换" : "sk-…"} required /><small>密钥使用 AES-GCM 加密；保存后不可查看。</small></label><button className="solid-action" disabled={busy === "settings"}>{busy === "settings" ? "正在保存…" : "保存模型配置"}</button>{settings && <div className="saved-setting"><span>✓</span><div><b>当前已连接 {settings.provider_name}</b><small>{settings.base_url} · {settings.model}</small></div></div>}</form></section>;
}

function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span>◇</span><b>{title}</b><p>{text}</p></div>; }
function initials(name: string) { return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "U"; }
function wikiLinks(content: string) { return [...content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map(match => match[1].trim()).filter(Boolean); }
function jsonHeaders() { return { "Content-Type": "application/json" }; }
async function jsonFetch(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) }); if (!response.ok) throw new Error(await apiMessage(response)); return response.json() as Promise<Record<string, unknown>>; }
async function apiMessage(response: Response) { try { const value = await response.json() as { error?: string }; return value.error || `请求失败 (${response.status})`; } catch { return `请求失败 (${response.status})`; } }
async function extractPdfText(file: File) {
  const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); const pdf = await task.promise;
  const pages: string[] = []; const maxPages = Math.min(pdf.numPages, 80);
  for (let number = 1; number <= maxPages; number += 1) { const page = await pdf.getPage(number); const content = await page.getTextContent(); pages.push(content.items.map(item => "str" in item ? item.str : "").join(" ")); if (pages.join("\n").length > 120_000) break; }
  return pages.join("\n").slice(0, 120_000);
}
