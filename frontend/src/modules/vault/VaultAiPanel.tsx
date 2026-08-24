import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { Bot, Loader2, Send } from 'lucide-react';
import { chatWithAi, getLlmStatus, saveNoteFile } from '../../api/client';
import { getErrorMessage } from '../../api/client';
import type { ChatMessage } from '../../types';
import { useVault } from './VaultContext';

const PRESETS = [
  '总结本篇',
  '续写',
  '整理结构',
  '提取概念',
  '生成 Properties',
  '建立双向链接',
  '寻找相关文献',
  '生成知识卡片',
  '检查逻辑'
];

/** 会产生「整篇修改建议」的预设：回复后可进入 Diff 审阅（铁律 4：绝不直接覆盖）。 */
const MODIFY_PRESETS = new Set(['续写', '整理结构', '生成 Properties', '建立双向链接', '生成知识卡片']);

function historyKey(path: string): string {
  return `kms.vault.chat.${path}`;
}

function loadHistory(path: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(historyKey(path));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

interface VaultAiPanelProps {
  path: string;
  content: string;
  properties: Record<string, unknown>;
  frontmatterValid: boolean;
  onContentSaved: (content: string) => void;
}

/**
 * Vault 右栏内嵌 AI（走现有 POST /api/ai/chat，context 字段）。
 * 形态参照 Phase 3 reader/AiPanel：预设按钮 + 自由输入 + 按笔记隔离持久化历史 + 模拟输出徽标。
 * AI 修改必须先显示 Diff，用户 Accept 后才写文件。
 */
export default function VaultAiPanel({ path, content, properties, frontmatterValid, onContentSaved }: VaultAiPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadHistory(path));
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [review, setReview] = useState<null | { preset: string; proposed: string; edited: string }>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const settingsQuery = useQuery({ queryKey: ['llm-status'], queryFn: () => getLlmStatus() });
  const mock = Boolean(settingsQuery.data?.mock);

  useEffect(() => {
    try {
      localStorage.setItem(historyKey(path), JSON.stringify(messages));
    } catch {
      // ignore
    }
  }, [messages, path]);

  useEffect(() => {
    setMessages(loadHistory(path));
    setError('');
    setReview(null);
  }, [path]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function buildContext(): string {
    const parts: string[] = [];
    parts.push(`【当前笔记】${path}`);
    parts.push(`【笔记全文】\n${content.slice(0, 12000)}`);
    if (Object.keys(properties).length > 0) {
      parts.push(`【Properties】${JSON.stringify(properties)}`);
    }
    if (!frontmatterValid) {
      parts.push('【警告】frontmatter 解析失败，如涉及 Properties 请先修复 YAML。');
    }
    parts.push('【要求】如需修改笔记，请输出修改后的完整 Markdown（含 frontmatter），不要只给说明。');
    return parts.join('\n\n');
  }

  async function send(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    setError('');
    const nextHistory: ChatMessage[] = [...messages, { role: 'user', content: prompt }];
    setMessages(nextHistory);
    setBusy(true);
    try {
      const response = await chatWithAi(undefined, nextHistory, buildContext());
      setMessages([...nextHistory, { role: 'assistant', content: response.reply }]);
      if (MODIFY_PRESETS.has(prompt) || prompt === '续写') {
        setReview({ preset: prompt, proposed: response.reply, edited: response.reply });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages([...nextHistory, { role: 'assistant', content: `（请求失败：${message}）` }]);
    } finally {
      setBusy(false);
    }
  }

  async function acceptReview() {
    if (!review) return;
    setBusy(true);
    try {
      // 接受 = 把 AI 建议写回文件（不带 baseMtime 属覆盖场景，但会先走正常保存链路）
      const saved = await saveNoteFile(path, review.edited);
      onContentSaved(review.edited);
      setReview(null);
      void saved;
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const diffParts = review ? diffLines(content, review.edited) : [];

  return (
    <div className="ai-panel">
      <div className="ai-presets">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="ai-preset" disabled={busy} onClick={() => void send(preset)}>
            {preset}
          </button>
        ))}
      </div>
      {mock && (
        <div className="ai-mock-note">
          <Bot size={12} aria-hidden="true" />
          当前为模拟输出（MOCK_LLM=true），未真实调用 LLM —— 结果不可作为真实链路验证结论
        </div>
      )}
      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>点上方预设动作直接提问，或在下方输入。</p>
            <p className="ai-empty-hint">AI 自动获得当前笔记全文、Properties；修改类预设会先显示 Diff，接受后才写盘。</p>
          </div>
        )}
        {messages.map((message, index) => (
          <div key={index} className={`ai-msg is-${message.role}`}>
            <div className="ai-msg-content">{message.content}</div>
          </div>
        ))}
        {busy && !review && (
          <div className="ai-msg is-assistant">
            <div className="ai-msg-content ai-msg-thinking">
              <Loader2 size={12} className="spin" aria-hidden="true" /> 思考中…
            </div>
          </div>
        )}
      </div>
      {error && <p className="ai-error">{error}</p>}
      <div className="ai-input-row">
        <input
          className="field-input"
          placeholder="向 AI 提问当前笔记…"
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void send(draft);
              setDraft('');
            }
          }}
        />
        <button type="button" className="btn btn-primary" disabled={busy || !draft.trim()} title="发送"
          onClick={() => { void send(draft); setDraft(''); }}>
          <Send size={13} aria-hidden="true" />
        </button>
      </div>

      {/* AI 修改 Diff 审阅（铁律：绝不直接覆盖） */}
      {review && (
        <div className="dialog-shell">
          <div className="dialog-overlay" onClick={() => setReview(null)} />
          <div className="dialog vault-conflict-dialog">
            <div className="dialog-header">
              <span className="dialog-title">AI 修改建议（{review.preset}）—— 接受前不写盘</span>
            </div>
            <div className="dialog-body">
              <p className="dialog-desc">左侧当前内容 ────── 右侧 AI 建议。接受后才会写入文件。</p>
              <div className="vault-diff">
                {diffParts.length === 0 && <div className="vault-diff-line">（无变化）</div>}
                {diffParts.map((part, index) => (
                  <div key={index} className={`vault-diff-line ${part.added ? 'is-added' : part.removed ? 'is-removed' : ''}`}>
                    {(part.added ? '+' : part.removed ? '−' : ' ')} {part.value}
                  </div>
                ))}
              </div>
              <div className="field">
                <label className="field-label">编辑后接受（可直接修改 AI 建议）</label>
                <textarea
                  className="field-input vault-diff-edit"
                  rows={8}
                  value={review.edited}
                  onChange={(event) => setReview({ ...review, edited: event.target.value })}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn btn-danger" onClick={() => setReview(null)}>拒绝</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void acceptReview()}>
                {busy ? '保存中…' : '接受'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
