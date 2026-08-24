"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Runner, Workspace } from "./WorkspaceApp";

type Tool = { name: string; permission: "read" | "write"; description: string };
type AgentStep = { id: number; sequence: number; tool_name: string; status: string; permission: string; input_json: string; output_json: string | null };
type RunState = { id: string; conversation_id: string; status: string; answer: string | null; step_count: number };
type Approval = { tool: string; input: Record<string, unknown>; reason: string; sequence: number };
type AgentPayload = { run: RunState; steps: AgentStep[]; approval?: Approval };

export function AiStudioPanel({ data, query, selectedPaperId, setSelectedPaperId, selectedNoteId, setSelectedNoteId, busy, run, refresh }: {
  data: Workspace;
  query: string;
  selectedPaperId: number | null;
  setSelectedPaperId: (id: number | null) => void;
  selectedNoteId: number | null;
  setSelectedNoteId: (id: number | null) => void;
  busy: string;
  run: Runner;
  refresh: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"chat" | "plan" | "agent">("chat");
  const [prompt, setPrompt] = useState("");
  const [reply, setReply] = useState("");
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [tools, setTools] = useState<Tool[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [historyOpen, setHistoryOpen] = useStoredBoolean("kms.ai.history.open", true);
  const [contextOpen, setContextOpen] = useStoredBoolean("kms.ai.context.open", true);
  const [historyWidth, setHistoryWidth] = useStoredNumber("kms.ai.history", 230, 180, 360);
  const [contextWidth, setContextWidth] = useStoredNumber("kms.ai.context", 280, 220, 420);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => { fetch("/api/v1/tools").then(response => response.ok ? response.json() as Promise<{ tools?: Tool[] }> : null).then(value => value && setTools(value.tools || [])).catch(() => undefined); }, []);
  const visibleMessages = useMemo(() => data.messages.filter(message => !query || message.content.toLowerCase().includes(query.toLowerCase())).slice(-30), [data.messages, query]);

  const send = (event: FormEvent) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    run("ai", async () => {
      setReply(""); setSteps([]); setApproval(null);
      if (mode === "agent") {
        const created = await jsonRequest("/api/v1/agent-runs", { prompt, paperId: selectedPaperId, noteId: selectedNoteId }) as { id: string };
        setRunId(created.id);
        await advance(created.id);
        return;
      }
      const controller = new AbortController(); controllerRef.current = controller;
      const response = await fetch("/api/ai/respond", { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ prompt, mode, paperId: selectedPaperId, noteId: selectedNoteId }), signal: controller.signal });
      if (!response.ok) throw new Error(await apiMessage(response));
      const result = await response.json() as { answer: string };
      setReply(result.answer); setPrompt(""); await refresh(); controllerRef.current = null;
    });
  };

  const advance = async (id: string) => {
    for (let index = 0; index < 8; index += 1) {
      const payload = await jsonRequest(`/api/v1/agent-runs/${id}/next`, {}) as AgentPayload;
      setSteps(payload.steps || []);
      if (payload.run.status === "approval_required") { setApproval(payload.approval || pendingApproval(payload.steps)); return; }
      if (payload.run.status === "completed") { setReply(payload.run.answer || "Agent 已完成。"); setPrompt(""); setRunId(null); await refresh(); return; }
      if (payload.run.status === "cancelled") { setReply("本次 Agent 运行已取消，未继续写入数据。"); setRunId(null); return; }
    }
    setReply("Agent 已保存当前进度，可稍后继续。");
  };

  const decideApproval = (decision: "once" | "always" | "reject") => run("ai", async () => {
    if (!runId) return;
    await jsonRequest(`/api/v1/agent-runs/${runId}/approve`, { decision });
    setApproval(null);
    await advance(runId);
  });

  const stop = async () => {
    controllerRef.current?.abort();
    if (runId) {
      await jsonRequest(`/api/v1/agent-runs/${runId}/cancel`, {});
      setRunId(null); setApproval(null); setReply("本次 Agent 运行已取消，后续步骤和写入均已停止。");
    }
  };

  return <section className="ai-pro" style={{ gridTemplateColumns: `${historyOpen ? historyWidth : 0}px ${historyOpen ? 5 : 0}px minmax(360px,1fr) ${contextOpen ? 5 : 0}px ${contextOpen ? contextWidth : 0}px` }}>
    <PaneToggleBar items={[{ label: "会话", open: historyOpen, toggle: () => setHistoryOpen(!historyOpen) }, { label: "上下文与工具", open: contextOpen, toggle: () => setContextOpen(!contextOpen) }]} />
    <aside className={`ai-history ${historyOpen ? "pane-open" : "pane-hidden"}`}><div className="module-list-head"><div><small>AI STUDIO</small><h1>会话</h1></div><button className="icon-action" onClick={() => { setReply(""); setSteps([]); setPrompt(""); }}>＋</button></div><div className="history-section"><b>最近对话</b>{visibleMessages.filter(message => message.role === "user").reverse().slice(0, 12).map(message => <button key={message.id}><span>◌</span><span>{message.content}<small>{message.mode} · {new Date(message.created_at).toLocaleDateString()}</small></span></button>)}</div><div className="history-section"><b>工作模式</b><p>Chat：直接讨论</p><p>Plan：只读分析与制定步骤</p><p>Agent：模型逐步选择真实工具，写入前审批</p></div><button className="collapse-pane" onClick={() => setHistoryOpen(false)}>‹ 收起会话</button></aside>
    {historyOpen && <ResizeHandle label="调整会话边栏" onDelta={delta => setHistoryWidth(historyWidth + delta)} onReset={() => setHistoryWidth(230)} />}
    <main className="ai-chat"><header><div><small>{mode.toUpperCase()} MODE</small><h1>{mode === "agent" ? "Agent 工作区" : mode === "plan" ? "先制定计划，再决定是否执行" : "与你的研究资料对话"}</h1></div><div className="mode-switch"><button className={mode === "chat" ? "active" : ""} onClick={() => setMode("chat")}>Chat</button><button className={mode === "plan" ? "active" : ""} onClick={() => setMode("plan")}>Plan</button><button className={mode === "agent" ? "active" : ""} onClick={() => setMode("agent")}>Agent</button></div></header><div className="ai-context-chips">{selectedPaperId && <span>▤ {data.papers.find(paper => paper.id === selectedPaperId)?.title}<button onClick={() => setSelectedPaperId(null)}>×</button></span>}{selectedNoteId && <span>◇ {data.notes.find(note => note.id === selectedNoteId)?.title}<button onClick={() => setSelectedNoteId(null)}>×</button></span>}{!selectedPaperId && !selectedNoteId && <small>尚未加入上下文</small>}</div><div className="chat-stage">{!reply && !visibleMessages.length && <Empty />}{visibleMessages.slice(-10).map(message => <article className={`chat-message ${message.role}`} key={message.id}><small>{message.role === "user" ? "你" : "AI"} · {message.mode}</small><p>{message.content}</p></article>)}{steps.length > 0 && <div className="tool-trace"><header><b>真实工具轨迹</b><span>{steps.length} 步</span></header>{steps.map(step => <div key={step.id}><span>{step.status === "completed" ? "✓" : step.status === "rejected" ? "×" : "…"}</span><code>{step.tool_name}</code><small>{step.status}</small></div>)}</div>}{approval && <section className="approval-card" role="alert"><small>写入权限审批</small><h3>{approval.tool}</h3><p>{approval.reason}</p><pre>{JSON.stringify(approval.input, null, 2)}</pre><div><button onClick={() => decideApproval("once")}>允许一次</button><button onClick={() => decideApproval("always")}>本次运行始终允许</button><button className="danger-link" onClick={() => decideApproval("reject")}>拒绝</button></div></section>}{reply && <article className="chat-message assistant latest"><small>本次回答</small><p>{reply}</p></article>}</div><form className="chat-composer" onSubmit={send}><textarea value={prompt} onChange={event => setPrompt(event.target.value)} placeholder={mode === "agent" ? "让 Agent 阅读、检索、比较，或经确认写入 Vault…" : mode === "plan" ? "描述目标，AI 将只给出计划…" : "询问文献、标注或笔记…"} /><div className="composer-footer"><span>{data.settings ? `${data.settings.provider_name} · ${data.settings.model}` : "请先配置模型 API"}</span>{busy === "ai" || runId ? <button type="button" onClick={() => void stop()}>停止 ■</button> : <button disabled={!data.settings || !prompt.trim()}>发送 ↗</button>}</div></form></main>
    {contextOpen && <ResizeHandle label="调整上下文边栏" onDelta={delta => setContextWidth(contextWidth - delta)} onReset={() => setContextWidth(280)} />}
    <aside className={`ai-context ${contextOpen ? "pane-open" : "pane-hidden"}`}><div className="context-head"><small>CONTEXT & TOOLS</small><b>上下文</b></div><label>文献<select value={selectedPaperId ?? ""} onChange={event => setSelectedPaperId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用文献</option>{data.papers.map(paper => <option value={paper.id} key={paper.id}>{paper.title}</option>)}</select></label><label>Vault 笔记<select value={selectedNoteId ?? ""} onChange={event => setSelectedNoteId(event.target.value ? Number(event.target.value) : null)}><option value="">不引用笔记</option>{data.notes.map(note => <option value={note.id} key={note.id}>{note.title}</option>)}</select></label><section><b>后端已注册工具</b>{tools.map(tool => <div className={`tool-permission ${tool.permission}`} key={tool.name}><span>{tool.permission === "read" ? "✓" : "!"}</span><code>{tool.name}</code><small>{tool.permission === "read" ? "只读" : "需确认"}</small></div>)}</section><button className="collapse-pane" onClick={() => setContextOpen(false)}>收起上下文 ›</button></aside>
  </section>;
}

function ResizeHandle({ label, onDelta, onReset }: { label: string; onDelta: (delta: number) => void; onReset: () => void }) {
  const origin = useRef(0);
  return <button type="button" className="resize-handle" aria-label={label} title="拖动调整，双击恢复，方向键微调" onDoubleClick={onReset} onKeyDown={event => { if (event.key === "ArrowLeft") onDelta(-10); if (event.key === "ArrowRight") onDelta(10); }} onPointerDown={event => { origin.current = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={event => { if (!event.currentTarget.hasPointerCapture(event.pointerId)) return; const delta = event.clientX - origin.current; origin.current = event.clientX; onDelta(delta); }} onPointerUp={event => event.currentTarget.releasePointerCapture(event.pointerId)} onPointerCancel={event => event.currentTarget.hasPointerCapture(event.pointerId) && event.currentTarget.releasePointerCapture(event.pointerId)}><span /></button>;
}

function PaneToggleBar({ items }: { items: Array<{ label: string; open: boolean; toggle: () => void }> }) {
  return <div className="pane-toggle-bar" aria-label="面板显示控制">{items.map(item => <button key={item.label} className={item.open ? "active" : ""} onClick={item.toggle}>{item.open ? "隐藏" : "显示"}{item.label}</button>)}</div>;
}

function Empty() { return <div className="empty-state"><span>✦</span><b>开始一次研究对话</b><p>加入文献或笔记；Agent 只会显示实际调用过的工具。</p></div>; }
function pendingApproval(steps: AgentStep[]): Approval | null { const step = [...steps].reverse().find(item => item.status === "approval_required"); if (!step) return null; return { tool: step.tool_name, input: safeJson(step.input_json), reason: "此工具会写入你的 Vault。", sequence: step.sequence }; }
function safeJson(value: string) { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } }
function jsonHeaders() { return { "Content-Type": "application/json" }; }
async function jsonRequest(url: string, body: unknown) { const response = await fetch(url, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) }); if (!response.ok) throw new Error(await apiMessage(response)); return response.json() as Promise<unknown>; }
async function apiMessage(response: Response) { try { const value = await response.json() as { error?: string }; return value.error || `请求失败 (${response.status})`; } catch { return `请求失败 (${response.status})`; } }
function useStoredNumber(key: string, initial: number, min: number, max: number): [number, (value: number) => void] { const [value, rawSet] = useState(() => { if (typeof window === "undefined") return initial; const stored = Number(localStorage.getItem(key)); return Number.isFinite(stored) && stored >= min && stored <= max ? stored : initial; }); const set = (next: number) => { const safe = Math.max(min, Math.min(max, next)); rawSet(safe); localStorage.setItem(key, String(safe)); }; return [value, set]; }
function useStoredBoolean(key: string, initial: boolean): [boolean, (value: boolean) => void] { const [value, rawSet] = useState(() => typeof window === "undefined" ? initial : localStorage.getItem(key) === null ? initial : localStorage.getItem(key) === "true"); const set = (next: boolean) => { rawSet(next); localStorage.setItem(key, String(next)); }; return [value, set]; }
