import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { Bot, Loader2, Send } from 'lucide-react';
import { chatWithAi, getLlmStatus, saveNoteFile } from '../../api/client';
import { getErrorMessage } from '../../api/client';
import type { ChatMessage } from '../../types';
import { useVault } from './VaultContext';

const PRESETS = [
  'summarize this',
  'continue',
  'Organize Structure',
  'Extract Concepts',
  'Generate Properties',
  'Build Bidirectional Link',
  'Find related papers',
  'Generate Knowledge Card',
  'checkQuerylogic'
];

/** will produce"Whole-doc modification suggestion" Preset: Enter after reply Diff review(iron law 4: Never overwrite directly).  */
const MODIFY_PRESETS = new Set(['continue', 'Organize Structure', 'Generate Properties', 'Build Bidirectional Link', 'Generate Knowledge Card']);

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
 * Vault Right Panel Inline AI(go existing POST /api/ai/chat, context Field). 
 * Form Reference Phase 3 reader/AiPanel: Preset Button + Free Input + Persist history per note + Mock Output Badge. 
 * AI Modify must show first Diff, User Accept only afterWrite File. 
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
    parts.push(`[currentNote]${path}`);
    parts.push(`[Note Full Text]\n${content.slice(0, 12000)}`);
    if (Object.keys(properties).length > 0) {
      parts.push(`[Properties]${JSON.stringify(properties)}`);
    }
    if (!frontmatterValid) {
      parts.push('[warning]frontmatter parseFailed, If involving Properties Please fix first YAML. ');
    }
    parts.push('[require]To modify note, Please output the full modified Markdown(with frontmatter), Do not only give explanation. ');
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
      if (MODIFY_PRESETS.has(prompt) || prompt === 'continue') {
        setReview({ preset: prompt, proposed: response.reply, edited: response.reply });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setMessages([...nextHistory, { role: 'assistant', content: `(Request failed: ${message})` }]);
    } finally {
      setBusy(false);
    }
  }

  async function acceptReview() {
    if (!review) return;
    setBusy(true);
    try {
      // accept =   AI suggestWrite BackFile(Without baseMtime overwrite scenario, But goes through normal save first)
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
          Currently mock output(MOCK_LLM=true), Not real call LLM -- result notCanasReallink validationConclusion
        </div>
      )}
      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>Click above preset to ask, Or input below. </p>
            <p className="ai-empty-hint">AI Auto get current note full text, Properties; Modify preset shows first Diff, Write after accept. </p>
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
              <Loader2 size={12} className="spin" aria-hidden="true" /> Thinking...
            </div>
          </div>
        )}
      </div>
      {error && <p className="ai-error">{error}</p>}
      <div className="ai-input-row">
        <input
          className="field-input"
          placeholder="to AI Ask Current Note..."
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
        <button type="button" className="btn btn-primary" disabled={busy || !draft.trim()} title="Send"
          onClick={() => { void send(draft); setDraft(''); }}>
          <Send size={13} aria-hidden="true" />
        </button>
      </div>

      {/* AI Modify Diff review(iron law: Never overwrite directly) */}
      {review && (
        <div className="dialog-shell">
          <div className="dialog-overlay" onClick={() => setReview(null)} />
          <div className="dialog vault-conflict-dialog">
            <div className="dialog-header">
              <span className="dialog-title">AI Modify Suggestion({review.preset})-- No write before accept</span>
            </div>
            <div className="dialog-body">
              <p className="dialog-desc">Leftside current content ---- Right AI suggest. Write file after accept. </p>
              <div className="vault-diff">
                {diffParts.length === 0 && <div className="vault-diff-line">(No Change)</div>}
                {diffParts.map((part, index) => (
                  <div key={index} className={`vault-diff-line ${part.added ? 'is-added' : part.removed ? 'is-removed' : ''}`}>
                    {(part.added ? '+' : part.removed ? '-' : ' ')} {part.value}
                  </div>
                ))}
              </div>
              <div className="field">
                <label className="field-label">Accept after edit(Can directly modify AI suggest)</label>
                <textarea
                  className="field-input vault-diff-edit"
                  rows={8}
                  value={review.edited}
                  onChange={(event) => setReview({ ...review, edited: event.target.value })}
                />
              </div>
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn btn-danger" onClick={() => setReview(null)}>reject</button>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void acceptReview()}>
                {busy ? 'Saving...' : 'accept'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
