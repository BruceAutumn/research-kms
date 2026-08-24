"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps, @typescript-eslint/no-unused-vars */

import { FormEvent, lazy, ReactNode, Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { NormalizedRect } from "./PdfCanvasViewer";
import { AiStudioPanel } from "./AiStudioPanel";
import { PluginManager } from "./PluginManager";

const PdfCanvasViewer = lazy(() => import("./PdfCanvasViewer").then(module => ({ default: module.PdfCanvasViewer })));

export type Paper = {
  id: number; title: string; authors: string | null; year: number | null; doi: string | null;
  abstract_text: string | null; filename: string | null; size_bytes: number; collection_name: string;
  tags: string; favorite: number; reading_progress: number; revision: number; created_at: string; updated_at: string;
};
export type Note = {
  id: number; stable_id: string; title: string; content: string; folder: string; properties: string; pinned: number;
  revision: number; created_at: string; updated_at: string;
};
export type Annotation = {
  id: number; paper_id: number; page: number; type: string; color: string; text: string;
  comment: string; rects_json: string; revision: number; created_at: string; updated_at: string;
};
export type AiMessage = { id: number; mode: string; role: "user" | "assistant"; content: string; created_at: string };
export type Settings = { provider_name: string; base_url: string; model: string; protocol: string; updated_at: string; hasApiKey: boolean } | null;
export type Workspace = {
  user: { displayName: string; email: string }; isAdmin: boolean; papers: Paper[]; notes: Note[];
  settings: Settings; messages: AiMessage[]; annotations: Annotation[];
};
type ToolStep = { name: string; detail: string; status: string };
type Source = { type: string; id: number; title: string; detail: string };
type Tab = "library" | "ai" | "vault" | "settings";

const PROVIDERS: Record<string, { region: "中国" | "全球" | "本地/网关"; baseUrl: string; model: string; protocol: "openai" | "anthropic" }> = {
  DeepSeek: { region: "中国", baseUrl: "https://api.deepseek.com", model: "deepseek-chat", protocol: "openai" },
  "通义千问 Qwen": { region: "中国", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus", protocol: "openai" },
  "Kimi / Moonshot": { region: "中国", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k2", protocol: "openai" },
  "智谱 GLM": { region: "中国", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5", protocol: "openai" },
  "豆包 / Ark": { region: "中国", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", model: "请填写 Endpoint ID", protocol: "openai" },
  MiniMax: { region: "中国", baseUrl: "https://api.minimax.chat/v1", model: "MiniMax-Text-01", protocol: "openai" },
  SiliconFlow: { region: "中国", baseUrl: "https://api.siliconflow.cn/v1", model: "deepseek-ai/DeepSeek-V3", protocol: "openai" },
  OpenAI: { region: "全球", baseUrl: "https://api.openai.com/v1", model: "gpt-5-mini", protocol: "openai" },
  "Anthropic Claude": { region: "全球", baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-4-5", protocol: "anthropic" },
  "Google Gemini": { region: "全球", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.1-pro", protocol: "openai" },
  "xAI Grok": { region: "全球", baseUrl: "https://api.x.ai/v1", model: "grok-4", protocol: "openai" },
  OpenRouter: { region: "本地/网关", baseUrl: "https://openrouter.ai/api/v1", model: "anthropic/claude-sonnet-4.5", protocol: "openai" },
  "自定义 HTTPS": { region: "本地/网关", baseUrl: "https://", model: "", protocol: "openai" },
};

export function WorkspaceApp() {
  const [data, setData] = useState<Workspace | null>(null);
  const [tab, setTab] = useState<Tab>("library");
  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [navWidth, setNavWidth] = useStoredNumber("kms.nav.width", 188, 148, 280);
  const [navOpen, setNavOpen] = useStoredBoolean("kms.nav.open", true);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const response = await fetch("/api/workspace", { cache: "no-store" });
    if (!response.ok) throw new Error(await apiMessage(response));
    const workspace = await response.json() as Workspace;
    setData(workspace);
    setSelectedPaperId(current => workspace.papers.some(p => p.id === current) ? current : workspace.papers[0]?.id ?? null);
    setSelectedNoteId(current => workspace.notes.some(n => n.id === current) ? current : workspace.notes[0]?.id ?? null);
  };

  useEffect(() => { refresh().catch(error => setNotice(error.message)); }, []);
  const run = async (label: string, action: () => Promise<void>) => {
    setBusy(label); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "操作失败，请稍后重试。"); }
    finally { setBusy(""); }
  };
  const uploadPdf = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    await run("upload", async () => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("请选择 PDF 文件。");
      if (file.size > 30 * 1024 * 1024) throw new Error("PDF 必须小于 30 MB。");
      const extractedText = await extractPdfText(file);
      const form = new FormData(); form.set("file", file); form.set("extractedText", extractedText);
      const response = await fetch("/api/papers/upload", { method: "POST", body: form });
      if (!response.ok) throw new Error(await apiMessage(response));
      const created = await response.json() as { id: number };
      await refresh(); setSelectedPaperId(created.id); setTab("library"); setNotice("PDF 已上传；可立即阅读、标注或用 AI 提取元数据。");
    });
    event.target.value = "";
  };
  if (!data) return <div className="app-loading"><span className="app-logo">R</span><p>{notice || "正在打开你的研究工作区…"}</p></div>;
  const selectedPaper = data.papers.find(paper => paper.id === selectedPaperId) ?? null;
  const selectedNote = data.notes.find(note => note.id === selectedNoteId) ?? null;
  return <div className="product-app">
    <header className="product-topbar">
      <Link className="product-brand" href="/"><span>R</span><b>Research KMS</b></Link>
      <label className="product-search"><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索文献、笔记与对话" /></label>
      <div className="product-user"><span>{initials(data.user.displayName)}</span><Link href="/account"><b>{data.user.displayName}</b><small>{data.user.email}</small></Link><a href="/signout-with-chatgpt?return_to=/">退出</a></div>
    </header>
    <div className={`product-shell ${navOpen ? "nav-open" : "nav-closed"}`} style={{ gridTemplateColumns: navOpen ? `${navWidth}px 5px minmax(0,1fr)` : "0 0 minmax(0,1fr)" }}>
      <nav className={`product-nav ${navOpen ? "pane-open" : "pane-hidden"}`} aria-label="工作区导航">
        <button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}><i>▤</i><span>文献库</span></button>
        <button className={tab === "ai" ? "active" : ""} onClick={() => setTab("ai")}><i>✦</i><span>AI Studio</span></button>
        <button className={tab === "vault" ? "active" : ""} onClick={() => setTab("vault")}><i>◇</i><span>知识库</span></button>
        <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><i>⚙</i><span>模型设置</span></button>
        {data.isAdmin && <a className="admin-entry" href="/admin">测试与运维后台</a>}
        <div className="nav-spacer" /><button className="collapse-pane" onClick={() => setNavOpen(false)} aria-label="收起主边栏">‹ 收起边栏</button><small>所有正文、附件、模型设置均按账户隔离</small>
      </nav>
      {navOpen && <ResizeHandle label="调整主边栏宽度" onDelta={delta => setNavWidth(navWidth + delta)} onReset={() => setNavWidth(188)} />}
      <main className="product-content">
        {!navOpen && <button className="nav-reopen" onClick={() => setNavOpen(true)} aria-label="展开主边栏">☰</button>}
        {notice && <div className="app-notice" role="status"><span>{notice}</span><button onClick={() => setNotice("")}>×</button></div>}
        {tab === "library" && <LibraryPanel data={data} query={query} selected={selectedPaper} selectedId={selectedPaperId} setSelected={setSelectedPaperId} onUpload={() => fileRef.current?.click()} uploadPdf={uploadPdf} fileRef={fileRef} busy={busy} refresh={refresh} run={run} openAi={() => setTab("ai")} openVault={(id) => { setSelectedNoteId(id); setTab("vault"); }} />}
        {tab === "ai" && <AiStudioPanel data={data} query={query} selectedPaperId={selectedPaperId} setSelectedPaperId={setSelectedPaperId} selectedNoteId={selectedNoteId} setSelectedNoteId={setSelectedNoteId} busy={busy} run={run} refresh={refresh} />}
        {tab === "vault" && <VaultPanel notes={data.notes} query={query} selected={selectedNote} selectedId={selectedNoteId} setSelected={setSelectedNoteId} busy={busy} run={run} refresh={refresh} />}
        {tab === "settings" && <SettingsPanel settings={data.settings} busy={busy} run={run} refresh={refresh} />}
      </main>
    </div>
    <input className="sr-only" ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={uploadPdf} />
  </div>;
}

function LibraryPanel({ data, query, selected, selectedId, setSelected, onUpload, busy, run, refresh, openAi, openVault }: {
  data: Workspace; query: string; selected: Paper | null; selectedId: number | null; setSelected: (id: number) => void;
  onUpload: () => void; uploadPdf: (event: React.ChangeEvent<HTMLInputElement>) => void; fileRef: React.RefObject<HTMLInputElement | null>;
  busy: string; run: Runner; refresh: () => Promise<void>; openAi: () => void; openVault: (id: number) => void;
}) {
  const [collection, setCollection] = useState("全部文献");
  const [sort, setSort] = useState("updated");
  const [zoom, setZoom] = useState(100);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [collectionsOpen, setCollectionsOpen] = useStoredBoolean("kms.library.collections.open", true);
  const [listOpen, setListOpen] = useStoredBoolean("kms.library.list.open", true);
  const [inspectorOpen, setInspectorOpen] = useStoredBoolean("kms.library.inspector.open", true);
  const [collectionWidth, setCollectionWidth] = useStoredNumber("kms.library.collections", 164, 130, 270); const [listWidth, setListWidth] = useStoredNumber("kms.library.list", 290, 220, 460);
  const [infoWidth, setInfoWidth] = useStoredNumber("kms.library.info", 310, 250, 480);
  const [meta, setMeta] = useState({ title: "", authors: "", year: "", doi: "", abstractText: "", collectionName: "收件箱", tags: "" });
  const [annotation, setAnnotation] = useState<{ type: string; color: string; text: string; comment: string; rects: NormalizedRect[] }>({ type: "highlight", color: "yellow", text: "", comment: "", rects: [] });
  const [inspector, setInspector] = useState<"info" | "annotations" | "related">("info");
  useEffect(() => {
    if (!selected) return;
    setMeta({ title: selected.title, authors: selected.authors || "", year: selected.year ? String(selected.year) : "", doi: selected.doi || "", abstractText: selected.abstract_text || "", collectionName: selected.collection_name || "收件箱", tags: parseTags(selected.tags).join(", ") });
    setPage(1);
  }, [selected]);
  const collections = useMemo(() => ["全部文献", "收藏夹", ...Array.from(new Set(data.papers.map(p => p.collection_name || "收件箱")))], [data.papers]);
  const papers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...data.papers].filter(p => (collection === "全部文献" || (collection === "收藏夹" ? Boolean(p.favorite) : p.collection_name === collection)) && (!needle || `${p.title} ${p.authors || ""} ${p.doi || ""} ${p.tags}`.toLowerCase().includes(needle)))
      .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) : sort === "year" ? Number(b.year || 0) - Number(a.year || 0) : (b.updated_at || b.created_at).localeCompare(a.updated_at || a.created_at));
  }, [data.papers, query, collection, sort]);
  const anns = data.annotations.filter(item => item.paper_id === selectedId);
  const patchPaper = (body: Record<string, unknown>, label = "paper") => selected && run(label, async () => {
    const response = await fetch(`/api/papers/${selected.id}`, { method: "PATCH", headers: jsonHeaders(), body: JSON.stringify({ ...body, revision: selected.revision }) });
    if (!response.ok) throw new Error(await apiMessage(response)); await refresh();
  });
  const extract = () => selected && run("extract", async () => {
    const response = await jsonFetch("/api/ai/extract", { paperId: selected.id });
    const result = response.metadata as Record<string, unknown>;
    setMeta(current => ({ ...current, title: String(result.title || current.title), authors: String(result.authors || current.authors), year: result.year ? String(result.year) : current.year, doi: String(result.doi || current.doi), abstractText: String(result.abstractText || current.abstractText) }));
  });
  const saveMetadata = () => patchPaper({ title: meta.title, authors: meta.authors, year: meta.year, doi: meta.doi, abstractText: meta.abstractText, collectionName: meta.collectionName, tags: meta.tags.split(/[,，]/).map(tag => tag.trim()).filter(Boolean) }, "metadata");
  const saveAnnotation = () => selected && run("annotation", async () => {
    const response = await fetch("/api/annotations", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ paperId: selected.id, page, ...annotation }) });
    if (!response.ok) throw new Error(await apiMessage(response)); setAnnotation(current => ({ ...current, text: "", comment: "", rects: [] })); await refresh();
  });
  const annotationToNote = () => selected && run("annotation-note", async () => {
    const content = `# ${selected.title} · 阅读标注\n\n${anns.map((ann, index) => `> ${ann.text || ann.comment}\n\n${ann.comment ? `**评论：** ${ann.comment}\n\n` : ""}[[${selected.title}]] · p.${ann.page} ^ann-${index + 1}`).join("\n\n")}`;
    const response = await fetch("/api/notes", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ title: `${selected.title} · 阅读笔记`, content, folder: "Literature", properties: { paperId: selected.id, tags: parseTags(selected.tags) } }) });
    if (!response.ok) throw new Error(await apiMessage(response)); const note = await response.json() as Note; await refresh(); openVault(note.id);
  });
  const remove = () => selected && confirm(`删除“${selected.title}”？`) && run("delete-paper", async () => {
    const response = await fetch(`/api/papers/${selected.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await apiMessage(response)); await refresh();
  });
  return <section className="library-pro" style={{ gridTemplateColumns: `${collectionsOpen ? collectionWidth : 0}px ${collectionsOpen ? 5 : 0}px ${listOpen ? listWidth : 0}px ${listOpen ? 5 : 0}px minmax(300px,1fr) ${inspectorOpen ? 5 : 0}px ${inspectorOpen ? infoWidth : 0}px` }}>
    <PaneToggleBar items={[{ label: "资料库", open: collectionsOpen, toggle: () => setCollectionsOpen(!collectionsOpen) }, { label: "文献列表", open: listOpen, toggle: () => setListOpen(!listOpen) }, { label: "信息/标注", open: inspectorOpen, toggle: () => setInspectorOpen(!inspectorOpen) }]} />
    <aside className={`collection-pane ${collectionsOpen ? "pane-open" : "pane-hidden"}`}><PaneTitle eyebrow="LIBRARY" title="资料库" action="＋" onAction={onUpload} /><button className="collection-import" onClick={onUpload}>{busy === "upload" ? "正在解析 PDF…" : "＋ 添加文献 / PDF"}</button><div className="tree-list">{collections.map(name => <button className={collection === name ? "active" : ""} key={name} onClick={() => setCollection(name)}><span>{name === "收藏夹" ? "★" : name === "全部文献" ? "▤" : "▸"}</span>{name}<small>{name === "全部文献" ? data.papers.length : name === "收藏夹" ? data.papers.filter(p => p.favorite).length : data.papers.filter(p => p.collection_name === name).length}</small></button>)}</div><div className="tag-cloud"><b>标签</b>{Array.from(new Set(data.papers.flatMap(p => parseTags(p.tags)))).slice(0, 16).map(tag => <span key={tag}>#{tag}</span>)}</div><button className="collapse-pane" onClick={() => setCollectionsOpen(false)}>‹ 收起资料库</button></aside>
    {collectionsOpen && <ResizeHandle label="调整资料库边栏" onDelta={delta => setCollectionWidth(collectionWidth + delta)} onReset={() => setCollectionWidth(164)} />}
    <aside className={`paper-list-pane ${listOpen ? "pane-open" : "pane-hidden"}`}><div className="list-toolbar"><b>{collection}</b><button className="collapse-icon" onClick={() => setListOpen(false)} aria-label="收起文献列表">‹</button><select value={sort} onChange={e => setSort(e.target.value)} aria-label="文献排序"><option value="updated">最近更新</option><option value="year">年份</option><option value="title">标题</option></select></div><div className="paper-count">{papers.length} 篇文献</div><div className="paper-rows">{papers.map(paper => <div role="button" tabIndex={0} key={paper.id} className={paper.id === selectedId ? "active" : ""} onClick={() => setSelected(paper.id)} onKeyDown={event => { if (event.key === "Enter") setSelected(paper.id); }}><i className="pdf-chip">PDF</i><span><b>{paper.title}</b><small>{paper.authors || paper.filename || "待完善作者"}</small><em>{paper.year || "—"} · {paper.collection_name || "收件箱"}</em></span><button className={`star ${paper.favorite ? "on" : ""}`} aria-label="收藏" onClick={event => { event.stopPropagation(); patchPaper({ favorite: !paper.favorite }); }}>★</button></div>)}</div>{!papers.length && <Empty title="没有匹配文献" text="上传 PDF，或更换集合与搜索条件。" />}</aside>
    {listOpen && <ResizeHandle label="调整文献列表宽度" onDelta={delta => setListWidth(listWidth + delta)} onReset={() => setListWidth(290)} />}
    <div className="reader-pane">{selected ? <><div className="reader-toolbar"><b title={selected.title}>{selected.title}</b><div><button onClick={() => setPage(Math.max(1, page - 1))} aria-label="上一页">‹</button><label>页 <input type="number" min="1" max={pageCount} value={page} onChange={event => setPage(Math.min(pageCount, Math.max(1, Number(event.target.value) || 1)))} /> / {pageCount}</label><button onClick={() => setPage(Math.min(pageCount, page + 1))} aria-label="下一页">›</button><button onClick={() => setZoom(Math.max(50, zoom - 10))}>−</button><span>{zoom}%</span><button onClick={() => setZoom(Math.min(200, zoom + 10))}>＋</button><button onClick={() => setRotation((rotation + 90) % 360)} aria-label="旋转页面">↻</button><a href={`/api/papers/${selected.id}/file`} target="_blank" rel="noreferrer">新窗口</a><a href={`/api/papers/${selected.id}/file`} download>下载</a></div></div><Suspense fallback={<div className="pdf-status">正在加载 PDF 阅读器…</div>}><PdfCanvasViewer url={`/api/papers/${selected.id}/file`} title={selected.title} page={page} zoom={zoom} rotation={rotation} annotations={anns} onPageCount={setPageCount} onAreaSelected={rect => { setAnnotation(current => ({ ...current, type: "area", rects: [rect], text: current.text || `第 ${page} 页区域标注` })); setInspector("annotations"); setInspectorOpen(true); }} /></Suspense><ReadingProgress value={selected.reading_progress || 0} onCommit={value => patchPaper({ readingProgress: value }, "progress")} /></> : <Empty title="选择一份文献" text="原始 PDF 仅对当前登录账户开放。" />}</div>
    {inspectorOpen && <ResizeHandle label="调整文献资料边栏" onDelta={delta => setInfoWidth(infoWidth - delta)} onReset={() => setInfoWidth(310)} />}
    <aside className={`inspector-pane ${inspectorOpen ? "pane-open" : "pane-hidden"}`}>{selected ? <><div className="inspector-tabs"><button className={inspector === "info" ? "active" : ""} onClick={() => setInspector("info")}>信息</button><button className={inspector === "annotations" ? "active" : ""} onClick={() => setInspector("annotations")}>标注 {anns.length}</button><button className={inspector === "related" ? "active" : ""} onClick={() => setInspector("related")}>关联</button><button className="collapse-icon" onClick={() => setInspectorOpen(false)} aria-label="收起信息栏">›</button></div>{inspector === "info" && <div className="metadata-form"><label>标题<textarea value={meta.title} onChange={e => setMeta({ ...meta, title: e.target.value })} /></label><label>作者<input value={meta.authors} onChange={e => setMeta({ ...meta, authors: e.target.value })} /></label><div className="field-pair"><label>年份<input value={meta.year} onChange={e => setMeta({ ...meta, year: e.target.value })} /></label><label>集合<input value={meta.collectionName} onChange={e => setMeta({ ...meta, collectionName: e.target.value })} /></label></div><label>DOI<input value={meta.doi} onChange={e => setMeta({ ...meta, doi: e.target.value })} /></label><label>标签<input value={meta.tags} onChange={e => setMeta({ ...meta, tags: e.target.value })} placeholder="方法, 待阅读" /></label><label>摘要<textarea className="abstract-input" value={meta.abstractText} onChange={e => setMeta({ ...meta, abstractText: e.target.value })} /></label><button className="solid-action" onClick={extract} disabled={Boolean(busy)}>✦ {busy === "extract" ? "AI 正在阅读…" : "AI 提取元数据"}</button><button className="secondary-action" onClick={saveMetadata}>保存资料</button><div className="inline-actions"><button onClick={() => exportBibTeX(selected)}>BibTeX</button><button onClick={openAi}>交给 AI</button><button className="danger-link" onClick={remove}>删除</button></div></div>}{inspector === "annotations" && <div className="annotation-panel"><div className="annotation-compose"><div className="field-pair"><label>类型<select value={annotation.type} onChange={e => setAnnotation({ ...annotation, type: e.target.value })}><option value="highlight">高亮</option><option value="underline">下划线</option><option value="note">便签</option><option value="area">区域</option></select></label><label>颜色<select value={annotation.color} onChange={e => setAnnotation({ ...annotation, color: e.target.value })}><option value="yellow">黄色</option><option value="green">绿色</option><option value="blue">蓝色</option><option value="pink">粉色</option><option value="purple">紫色</option></select></label></div>{annotation.rects.length > 0 && <p className="selection-notice">已选择第 {page} 页区域，坐标将按页面比例保存。</p>}<label>摘录<textarea value={annotation.text} onChange={e => setAnnotation({ ...annotation, text: e.target.value })} placeholder="粘贴选中的原文" /></label><label>评论<textarea value={annotation.comment} onChange={e => setAnnotation({ ...annotation, comment: e.target.value })} placeholder="写下你的判断" /></label><button className="solid-action" onClick={saveAnnotation}>保存第 {page} 页标注</button></div><div className="annotation-list">{anns.map(ann => <article key={ann.id} className={`ann-${ann.color}`}><header><b>{ann.type} · p.{ann.page}</b><button onClick={() => run("delete-ann", async () => { const response = await fetch(`/api/annotations?id=${ann.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await apiMessage(response)); await refresh(); })}>×</button></header><blockquote>{ann.text}</blockquote>{ann.comment && <p>{ann.comment}</p>}<button onClick={() => setPage(ann.page)}>回到此页</button></article>)}</div>{anns.length > 0 && <button className="secondary-action" onClick={annotationToNote}>全部导出到笔记</button>}</div>}{inspector === "related" && <div className="related-panel"><h3>相关内容</h3><p>使用标签和双链把文献与 Vault 连接起来。</p>{data.notes.filter(note => note.content.includes(selected.title) || note.content.includes(`paperId: ${selected.id}`)).map(note => <button key={note.id} onClick={() => openVault(note.id)}>◇ {note.title}</button>)}<button className="secondary-action" onClick={openAi}>让 Agent 检索关系</button></div>}</> : <Empty title="文献资料" text="选择文献后查看元数据与标注。" />}</aside>
  </section>;
}

function AiPanel({ data, query, selectedPaperId, setSelectedPaperId, selectedNoteId, setSelectedNoteId, busy, run, refresh }: {
  data: Workspace; query: string; selectedPaperId: number | null; setSelectedPaperId: (id: number | null) => void; selectedNoteId: number | null; setSelectedNoteId: (id: number | null) => void; busy: string; run: Runner; refresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"chat" | "plan" | "agent">("chat");
  const [prompt, setPrompt] = useState(""); const [reply, setReply] = useState(""); const [steps, setSteps] = useState<ToolStep[]>([]); const [sources, setSources] = useState<Source[]>([]);
  const [historyWidth, setHistoryWidth] = useStoredNumber("kms.ai.history", 230, 180, 360); const [contextWidth, setContextWidth] = useStoredNumber("kms.ai.context", 280, 220, 420);
  const controllerRef = useRef<AbortController | null>(null);
  const visibleMessages = data.messages.filter(message => !query || message.content.toLowerCase().includes(query.toLowerCase())).slice(-30);
  const send = (event: FormEvent) => { event.preventDefault(); if (!prompt.trim()) return; run("ai", async () => {
    const controller = new AbortController(); controllerRef.current = controller;
    const response = await fetch("/api/ai/respond", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ prompt, mode, paperId: selectedPaperId, noteId: selectedNoteId }), signal: controller.signal });
    if (!response.ok) throw new Error(await apiMessage(response));
    const result = await response.json() as { answer: string; steps?: ToolStep[]; sources?: Source[] };
    setReply(result.answer); setSteps(result.steps || []); setSources(result.sources || []); setPrompt(""); await refresh(); controllerRef.current = null;
  }); };
  return <section className="ai-pro" style={{ gridTemplateColumns: `${historyWidth}px 5px minmax(360px,1fr) 5px ${contextWidth}px` }}>
    <aside className="ai-history"><PaneTitle eyebrow="AI STUDIO" title="会话" action="＋" onAction={() => { setReply(""); setSteps([]); setSources([]); }} /><div className="history-section"><b>最近对话</b>{visibleMessages.filter(m => m.role === "user").reverse().slice(0, 12).map(message => <button key={message.id}><span>◌</span><span>{message.content}<small>{message.mode} · {new Date(message.created_at).toLocaleDateString()}</small></span></button>)}</div><div className="history-section"><b>工作模式</b><p>Chat：直接讨论</p><p>Plan：只分析与制定步骤</p><p>Agent：读取资料并显示工具轨迹</p></div></aside>
    <ResizeHandle label="调整会话边栏" onDelta={delta => setHistoryWidth(historyWidth + delta)} />
    <main className="ai-chat"><header><div><small>{mode.toUpperCase()} MODE</small><h1>{mode === "agent" ? "Agent 工作区" : mode === "plan" ? "先制定计划，再决定是否执行" : "与你的研究资料对话"}</h1></div><div className="mode-switch"><button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>Chat</button><button className={mode === "plan" ? "active" : ""} onClick={() => setMode("plan")}>Plan</button><button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>Agent</button></div></header><div className="ai-context-chips">{selectedPaperId && <span>▤ {data.papers.find(p => p.id === selectedPaperId)?.title}<button onClick={() => setSelectedPaperId(null)}>×</button></span>}{selectedNoteId && <span>◇ {data.notes.find(n => n.id === selectedNoteId)?.title}<button onClick={() => setSelectedNoteId(null)}>×</button></span>}{!selectedPaperId && !selectedNoteId && <small>尚未加入上下文</small>}</div><div className="chat-stage">{!reply && !data.messages.length && <Empty title="开始一次研究对话" text="从右侧加入文献或笔记，模型只能读取你明确提供的上下文。" />}{visibleMessages.slice(-10).map(message => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? "你" : "AI"} · {message.mode}</small><MarkdownPreview content={message.content} /></article>)}{steps.length > 0 && <div className="tool-trace"><header><b>工具轨迹</b><span>{steps.length} 步已完成</span></header>{steps.map((step, index) => <div key={`${step.name}-${index}`}><span>✓</span><code>{step.name}</code><small>{step.detail}</small></div>)}</div>}{reply && <article className="chat-message assistant latest"><small>本次回答</small><MarkdownPreview content={reply} /></article>}</div><form className="chat-composer" onSubmit={send}><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={mode === "agent" ? "让 Agent 阅读、检索、比较并整理…" : mode === "plan" ? "描述目标，AI 将只给出计划…" : "询问文献、标注或笔记…"} /><div className="composer-footer"><span>{data.settings ? `${data.settings.provider_name} · ${data.settings.model}` : "请先配置模型 API"}</span>{busy === "ai" ? <button type="button" onClick={() => controllerRef.current?.abort()}>停止 ■</button> : <button disabled={!data.settings || !prompt.trim()}>发送 ↗</button>}</div></form></main>
    <ResizeHandle label="调整上下文边栏" onDelta={delta => setContextWidth(contextWidth - delta)} />
    <aside className="ai-context"><div className="context-head"><small>CONTEXT & TOOLS</small><b>上下文</b></div><label>文献<select value={selectedPaperId ?? ""} onChange={event => setSelectedPaperId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用文献</option>{data.papers.map(p => <option value={p.id} key={p.id}>{p.title}</option>)}</select></label><label>Vault 笔记<select value={selectedNoteId ?? ""} onChange={event => setSelectedNoteId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用笔记</option>{data.notes.map(n => <option value={n.id} key={n.id}>{n.title}</option>)}</select></label><section><b>可用工具</b>{["read_paper", "list_annotations", "read_vault_note", "search_vault", "search_library"].map(tool => <div className="tool-permission" key={tool}><span>✓</span><code>{tool}</code><small>只读</small></div>)}<div className="tool-permission write"><span>!</span><code>write_to_vault</code><small>需确认</small></div></section><section><b>来源</b>{sources.length ? sources.map((source, index) => <div className="source-card" key={`${source.type}-${source.id}`}><span>[^{index + 1}]</span><b>{source.title}</b><small>{source.detail}</small></div>) : <p>回答来源会显示在这里。</p>}</section></aside>
  </section>;
}

function VaultPanel({ notes, query, selected, selectedId, setSelected, run, refresh }: {
  notes: Note[]; query: string; selected: Note | null; selectedId: number | null; setSelected: (id: number | null) => void; busy: string; run: Runner; refresh: () => Promise<void>;
}) {
  const [title, setTitle] = useState(selected?.title ?? ""); const [content, setContent] = useState(selected?.content ?? ""); const [folder, setFolder] = useState(selected?.folder ?? "Inbox"); const [propertiesText, setPropertiesText] = useState(""); const [pinned, setPinned] = useState(Boolean(selected?.pinned));
  const [view, setView] = useState<"edit" | "preview" | "split">("split"); const [treeWidth, setTreeWidth] = useStoredNumber("kms.vault.tree", 245, 190, 380); const [linkWidth, setLinkWidth] = useStoredNumber("kms.vault.links", 285, 230, 430); const [saveState, setSaveState] = useState("已保存");
  const [treeOpen, setTreeOpen] = useStoredBoolean("kms.vault.tree.open", true); const [linksOpen, setLinksOpen] = useStoredBoolean("kms.vault.links.open", true); const creatingRef = useRef(false);
  useEffect(() => { setTitle(selected?.title ?? ""); setContent(selected?.content ?? ""); setFolder(selected?.folder ?? "Inbox"); setPropertiesText(formatProperties(selected?.properties)); setPinned(Boolean(selected?.pinned)); setSaveState("已保存"); }, [selected]);
  const filtered = notes.filter(note => !query || `${note.title} ${note.content} ${note.folder} ${note.properties}`.toLowerCase().includes(query.toLowerCase()));
  const folders = Array.from(new Set(["Inbox", ...notes.map(note => note.folder || "Inbox")])).sort();
  const backlinks = useMemo(() => selected ? notes.filter(note => note.id !== selected.id && wikiLinks(note.content).includes(selected.title)) : [], [notes, selected]);
  const outgoing = wikiLinks(content);
  const save = () => run("note", async () => {
    if (!title.trim()) throw new Error("请填写笔记标题。");
    if (!selected && creatingRef.current) return;
    if (!selected) creatingRef.current = true;
    setSaveState("保存中…");
    try {
      const response = await fetch("/api/notes", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ id: selected?.id, revision: selected?.revision, title, content, folder, properties: parseProperties(propertiesText), pinned }) });
      if (response.status === 409) { setSaveState("版本冲突：请比较服务器版本"); throw new Error(await apiMessage(response)); }
      if (!response.ok) throw new Error(await apiMessage(response)); const saved = await response.json() as Note; await refresh(); setSelected(saved.id); setSaveState("已保存");
    } finally { creatingRef.current = false; }
  });
  useEffect(() => {
    if (selected && title === selected.title && content === selected.content && folder === selected.folder && pinned === Boolean(selected.pinned) && propertiesText === formatProperties(selected.properties)) return;
    if (!selected && !title.trim() && !content.trim()) return;
    setSaveState("有未保存更改"); const timer = window.setTimeout(() => { void save(); }, 1200); return () => window.clearTimeout(timer);
  }, [title, content, folder, propertiesText, pinned]);
  const create = (targetFolder = "Inbox") => { setSelected(null); setTitle("未命名笔记"); setFolder(targetFolder); setPropertiesText("status: draft\ntags: research"); setPinned(false); setContent("# 未命名笔记\n\n使用 [[另一篇笔记]] 创建双向链接。\n"); setSaveState("有未保存更改"); };
  const remove = () => selected && confirm(`删除“${selected.title}”？`) && run("delete-note", async () => { const response = await fetch(`/api/notes?id=${selected.id}`, { method: "DELETE" }); if (!response.ok) throw new Error(await apiMessage(response)); setSelected(notes.find(note => note.id !== selected.id)?.id ?? null); await refresh(); });
  return <section className="vault-pro" style={{ gridTemplateColumns: `${treeOpen ? treeWidth : 0}px ${treeOpen ? 5 : 0}px minmax(400px,1fr) ${linksOpen ? 5 : 0}px ${linksOpen ? linkWidth : 0}px` }}>
    <PaneToggleBar items={[{ label: "文件树", open: treeOpen, toggle: () => setTreeOpen(!treeOpen) }, { label: "关系与图谱", open: linksOpen, toggle: () => setLinksOpen(!linksOpen) }]} />
    <aside className={`vault-tree ${treeOpen ? "pane-open" : "pane-hidden"}`}><PaneTitle eyebrow="VAULT" title="知识库" action="＋" onAction={() => create()} /><div className="vault-search">⌕ {filtered.length} 个结果</div>{folders.map(name => <section key={name}><header><b>▾ {name}</b><button onClick={() => create(name)}>＋</button></header>{filtered.filter(note => (note.folder || "Inbox") === name).map(note => <button key={note.id} className={note.id === selectedId ? "active" : ""} onClick={() => setSelected(note.id)}><span>{note.pinned ? "★" : "◇"}</span>{note.title}</button>)}</section>)}<button className="collapse-pane" onClick={() => setTreeOpen(false)}>‹ 收起文件树</button></aside>
    {treeOpen && <ResizeHandle label="调整文件树宽度" onDelta={delta => setTreeWidth(treeWidth + delta)} onReset={() => setTreeWidth(245)} />}
    <main className="vault-editor"><header className="vault-toolbar"><div className="mode-switch"><button className={view === "edit" ? "active" : ""} onClick={() => setView("edit")}>编辑</button><button className={view === "preview" ? "active" : ""} onClick={() => setView("preview")}>阅读</button><button className={view === "split" ? "active" : ""} onClick={() => setView("split")}>双栏</button></div><span>{saveState}</span><button onClick={() => void save()}>保存 ⌘S</button></header><div className="properties-editor"><b>属性</b><label>文件夹<input value={folder} onChange={event => setFolder(event.target.value)} /></label><label>置顶<input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} /></label><textarea value={propertiesText} onChange={event => setPropertiesText(event.target.value)} aria-label="YAML 属性" placeholder="tags: research" /></div><input className="note-title" value={title} onChange={event => setTitle(event.target.value)} placeholder="笔记标题" /><div className={`editor-surface ${view}`}>{view !== "preview" && <textarea value={content} onChange={event => setContent(event.target.value)} aria-label="Markdown 笔记正文" placeholder="写下你的研究想法…" />}{view !== "edit" && <article className="markdown-preview"><MarkdownPreview content={content} onWikiLink={name => { const target = notes.find(note => note.title === name); if (target) setSelected(target.id); else { setTitle(name); setSelected(null); setContent(`# ${name}\n\n`); } }} /></article>}</div><footer><span>Markdown · WikiLink · 属性 · 自动保存</span>{selected && <button className="danger-link" onClick={remove}>删除笔记</button>}</footer></main>
    {linksOpen && <ResizeHandle label="调整关系边栏宽度" onDelta={delta => setLinkWidth(linkWidth - delta)} onReset={() => setLinkWidth(285)} />}
    <aside className={`vault-links ${linksOpen ? "pane-open" : "pane-hidden"}`}><div className="context-head"><small>LINKED THINKING</small><b>关系与图谱</b></div><section><b>链接到 · {outgoing.length}</b>{outgoing.length ? outgoing.map(link => <button key={link} onClick={() => { const target = notes.find(note => note.title === link); if (target) setSelected(target.id); }}>→ {link}</button>) : <p>输入 [[笔记标题]] 创建链接</p>}</section><section><b>反向链接 · {backlinks.length}</b>{backlinks.length ? backlinks.map(note => <button key={note.id} onClick={() => setSelected(note.id)}>← {note.title}</button>) : <p>暂无反向链接</p>}</section><section><b>局部图谱</b><KnowledgeGraph notes={notes} selected={selected} onSelect={setSelected} /></section><section><b>数据库视图</b><div className="base-table"><span>名称</span><span>文件夹</span>{notes.slice(0, 6).map(note => <button key={note.id} onClick={() => setSelected(note.id)}><b>{note.title}</b><small>{note.folder}</small></button>)}</div></section><button className="collapse-pane" onClick={() => setLinksOpen(false)}>收起关系栏 ›</button></aside>
  </section>;
}

function SettingsPanel({ settings, busy, run, refresh }: { settings: Settings; busy: string; run: Runner; refresh: () => Promise<void> }) {
  const initialProvider = settings?.provider_name && settings.provider_name in PROVIDERS ? settings.provider_name : "DeepSeek";
  const [provider, setProvider] = useState(initialProvider); const [baseUrl, setBaseUrl] = useState(settings?.base_url ?? PROVIDERS.DeepSeek.baseUrl); const [model, setModel] = useState(settings?.model ?? PROVIDERS.DeepSeek.model); const [protocol, setProtocol] = useState<"openai" | "anthropic">((settings?.protocol as "openai" | "anthropic") ?? "openai"); const [apiKey, setApiKey] = useState("");
  const changeProvider = (value: string) => { setProvider(value); const preset = PROVIDERS[value]; if (preset) { setBaseUrl(preset.baseUrl); setModel(preset.model); setProtocol(preset.protocol); } };
  const submit = (event: FormEvent) => { event.preventDefault(); run("settings", async () => { const response = await fetch("/api/settings", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ providerName: provider, baseUrl, model, protocol, apiKey }) }); if (!response.ok) throw new Error(await apiMessage(response)); setApiKey(""); await refresh(); }); };
  const grouped = (["中国", "全球", "本地/网关"] as const).map(region => ({ region, names: Object.entries(PROVIDERS).filter(([, value]) => value.region === region).map(([name]) => name) }));
  return <section className="settings-page"><header className="module-header"><div><small>MODEL ROUTER</small><h1>连接你的 AI 模型</h1><p>同一界面支持中国、全球主流模型和 OpenAI-compatible 网关；Key 只在服务端加密保存。</p></div></header><form className="settings-card" onSubmit={submit}><label>模型服务商<select value={provider} onChange={event => changeProvider(event.target.value)}>{grouped.map(group => <optgroup label={group.region} key={group.region}>{group.names.map(name => <option key={name}>{name}</option>)}</optgroup>)}</select></label><div className="provider-grid">{Object.entries(PROVIDERS).map(([name, preset]) => <button type="button" className={provider === name ? "active" : ""} key={name} onClick={() => changeProvider(name)}><b>{name}</b><small>{preset.region} · {preset.protocol === "anthropic" ? "Anthropic Messages" : "OpenAI-compatible"}</small></button>)}</div><div className="field-pair"><label>协议<select value={protocol} onChange={event => setProtocol(event.target.value as "openai" | "anthropic")}><option value="openai">OpenAI Chat Completions</option><option value="anthropic">Anthropic Messages</option></select></label><label>模型 ID<input value={model} onChange={event => setModel(event.target.value)} required /></label></div><label>API Base URL<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} required /><small>Web 端仅连接公网 HTTPS；本地 Ollama 可通过兼容网关或私有部署使用。</small></label><label>个人 API Key<input type="password" value={apiKey} onChange={event => setApiKey(event.target.value)} autoComplete="new-password" placeholder={settings?.hasApiKey ? "已加密保存；留空沿用，输入可替换" : "输入服务商 API Key"} required={!settings?.hasApiKey} /><small>AES-GCM 加密；页面和日志均不会显示完整密钥。</small></label><button className="solid-action" disabled={busy === "settings"}>{busy === "settings" ? "正在验证并保存…" : "保存模型配置"}</button>{settings && <div className="saved-setting"><span>✓</span><div><b>当前已连接 {settings.provider_name}</b><small>{settings.base_url} · {settings.model}</small></div></div>}</form><PluginManager /></section>;
}

function PaneTitle({ eyebrow, title, action, onAction }: { eyebrow: string; title: string; action: string; onAction: () => void }) { return <div className="module-list-head"><div><small>{eyebrow}</small><h1>{title}</h1></div><button className="icon-action" onClick={onAction}>{action}</button></div>; }
function ResizeHandle({ label, onDelta, onReset }: { label: string; onDelta: (delta: number) => void; onReset?: () => void }) {
  const origin = useRef(0);
  return <button type="button" className="resize-handle" aria-label={label} title="拖动调整，双击恢复，方向键微调" onDoubleClick={onReset} onKeyDown={event => { if (event.key === "ArrowLeft") onDelta(-10); if (event.key === "ArrowRight") onDelta(10); }} onPointerDown={event => { origin.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const delta = event.clientX - origin.current; origin.current = event.clientX; onDelta(delta); }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} onPointerCancel={event => event.currentTarget.hasPointerCapture(event.pointerId) && event.currentTarget.releasePointerCapture(event.pointerId)}><span /></button>;
}
function PaneToggleBar({ items }: { items: Array<{ label: string; open: boolean; toggle: () => void }> }) { return <div className="pane-toggle-bar" aria-label="面板显示控制">{items.map(item => <button key={item.label} className={item.open ? "active" : ""} onClick={item.toggle}>{item.open ? "隐藏" : "显示"}{item.label}</button>)}</div>; }
function ReadingProgress({ value, onCommit }: { value: number; onCommit: (value: number) => void }) { const [draft, setDraft] = useState(value); useEffect(() => setDraft(value), [value]); useEffect(() => { if (draft === value) return; const timer = window.setTimeout(() => onCommit(draft), 700); return () => window.clearTimeout(timer); }, [draft, value]); return <div className="reading-progress"><span style={{ width: `${draft}%` }} /><label>阅读进度 <input type="range" min="0" max="100" value={draft} onChange={event => setDraft(Number(event.target.value))} /> {draft}%</label></div>; }
function MarkdownPreview({ content, onWikiLink }: { content: string; onWikiLink?: (name: string) => void }) {
  const lines = content.split("\n"); return <>{lines.map((line, index) => {
    const inline = renderInline(line, onWikiLink);
    if (line.startsWith("### ")) return <h3 key={index}>{renderInline(line.slice(4), onWikiLink)}</h3>;
    if (line.startsWith("## ")) return <h2 key={index}>{renderInline(line.slice(3), onWikiLink)}</h2>;
    if (line.startsWith("# ")) return <h1 key={index}>{renderInline(line.slice(2), onWikiLink)}</h1>;
    if (line.startsWith("> ")) return <blockquote key={index}>{renderInline(line.slice(2), onWikiLink)}</blockquote>;
    if (/^[-*] /.test(line)) return <li key={index}>{renderInline(line.slice(2), onWikiLink)}</li>;
    if (/^```/.test(line)) return <code key={index}>{line.slice(3)}</code>;
    return line.trim() ? <p key={index}>{inline}</p> : <br key={index} />;
  })}</>;
}
function renderInline(text: string, onWikiLink?: (name: string) => void): ReactNode[] {
  const parts = text.split(/(\[\[[^\]]+\]\]|\[\^\d+\]|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("[[") && part.endsWith("]]")) { const name = part.slice(2, -2).split("|")[0]; return <button className="wiki-link" key={index} onClick={() => onWikiLink?.(name)}>{name}</button>; }
    if (/^\[\^\d+\]$/.test(part)) return <sup key={index}>{part}</sup>;
    if (part.startsWith("**") && part.endsWith("**")) return <strong key={index}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
function KnowledgeGraph({ notes, selected, onSelect }: { notes: Note[]; selected: Note | null; onSelect: (id: number | null) => void }) {
  const connected = selected ? notes.filter(note => note.id === selected.id || wikiLinks(note.content).includes(selected.title) || wikiLinks(selected.content).includes(note.title)).slice(0, 8) : notes.slice(0, 6);
  return <div className="knowledge-graph">{connected.map((note, index) => <button title={note.title} className={note.id === selected?.id ? "active" : ""} style={{ left: `${15 + (index * 31) % 72}%`, top: `${18 + (index * 47) % 62}%` }} key={note.id} onClick={() => onSelect(note.id)}>{note.title.slice(0, 2)}</button>)}</div>;
}
function Empty({ title, text }: { title: string; text: string }) { return <div className="empty-state"><span>◇</span><b>{title}</b><p>{text}</p></div>; }
export type Runner = (label: string, action: () => Promise<void>) => Promise<void>;
function useStoredNumber(key: string, initial: number, min: number, max: number): [number, (value: number) => void] { const [value, rawSet] = useState(initial); useEffect(() => { const stored = Number(localStorage.getItem(key)); if (Number.isFinite(stored) && stored >= min && stored <= max) rawSet(stored); }, [key, min, max]); const set = (next: number) => { const safe = Math.max(min, Math.min(max, next)); rawSet(safe); localStorage.setItem(key, String(safe)); }; return [value, set]; }
function useStoredBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] { const [value, rawSet] = useState(initial); useEffect(() => { const stored = localStorage.getItem(key); if (stored === "true" || stored === "false") rawSet(stored === "true"); }, [key]); const set = (next: boolean) => { rawSet(next); localStorage.setItem(key, String(next)); }; return [value, set]; }
function initials(name: string) { return name.split(/\s+/).map(part => part[0]).join("").slice(0, 2).toUpperCase() || "U"; }
function wikiLinks(content: string) { return [...content.matchAll(/\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/g)].map(match => match[1].trim()).filter(Boolean); }
function parseTags(value: string) { try { const parsed = JSON.parse(value || "[]"); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
function parseProperties(value: string) { return Object.fromEntries(value.split("\n").map(line => line.split(":")).filter(parts => parts.length > 1).map(([key, ...rest]) => [key.trim(), rest.join(":").trim()])); }
function formatProperties(value?: string) { try { const object = JSON.parse(value || "{}"); return Object.entries(object).map(([key, item]) => `${key}: ${Array.isArray(item) ? item.join(", ") : String(item)}`).join("\n"); } catch { return ""; } }
function exportBibTeX(paper: Paper) { const key = `${(paper.authors || "paper").split(/[ ,]/)[0]}${paper.year || "nd"}`.replace(/\W/g, ""); const value = `@article{${key},\n  title = {${paper.title}},\n  author = {${paper.authors || ""}},\n  year = {${paper.year || ""}},\n  doi = {${paper.doi || ""}}\n}\n`; const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([value], { type: "application/x-bibtex" })); link.download = `${key}.bib`; link.click(); URL.revokeObjectURL(link.href); }
function jsonHeaders() { return { "Content-Type": "application/json" }; }
async function jsonFetch(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) }); if (!response.ok) throw new Error(await apiMessage(response)); return response.json() as Promise<Record<string, unknown>>; }
async function apiMessage(response: Response) { try { const value = await response.json() as { error?: string }; return value.error || `请求失败 (${response.status})`; } catch { return `请求失败 (${response.status})`; } }
async function extractPdfText(file: File) { const [{ GlobalWorkerOptions, getDocument }, { default: pdfWorker }] = await Promise.all([import("pdfjs-dist/legacy/build/pdf.mjs"), import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")]); GlobalWorkerOptions.workerSrc = pdfWorker; const task = getDocument({ data: new Uint8Array(await file.arrayBuffer()) }); const pdf = await task.promise; const pages: string[] = []; for (let number = 1; number <= pdf.numPages; number += 1) { const page = await pdf.getPage(number); const content = await page.getTextContent(); pages.push(content.items.map(item => "str" in item ? item.str : "").join(" ")); } return pages.join("\n").slice(0, 500_000); }
