import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bot, Brain, ChevronDown, ChevronRight, Globe, Loader2, Send } from 'lucide-react';
import { getLlmStatus } from '../../../api/client';
import type { Annotation, ChatMessage, Paper } from '../../../types';
import { useReaderChat } from './ReaderChatContext';

const PRESETS = [
  'explainSelectedcontent',
  'summarize this chapter',
  'summarizeFull Text',
  'Extract Experimental Conditions',
  'Extract Material Info',
  'Extract Data Table',
  'Extract Research Conclusion',
  'Extract Keywords',
  'Generate Reading Note'
];

type Effort = 'low' | 'medium' | 'high';

export interface AutoPrompt {
  text: string;
  ts: number;
}

interface AiPanelProps {
  paper: Paper;
  currentPage: number;
  currentPageText: string;
  selectionText: string | null;
  annotations: Annotation[];
  autoPrompt: AutoPrompt | null;
  onAutoPromptDone: () => void;
}

function parseThinking(content: string): { thinking: string; answer: string } {
  if (!content) return { thinking: '', answer: '' };
  const thinkPattern = /<thinking>([\s\S]*?)<\/thinking>/g;
  let thinkParts = '';
  let match;
  while ((match = thinkPattern.exec(content)) !== null) {
    thinkParts += match[1].trim() + '\n';
  }
  const remaining = content.replace(thinkPattern, '').trim();
  return { thinking: thinkParts.trim(), answer: remaining };
}

export default function AiPanel({
  paper,
  currentPage,
  currentPageText,
  selectionText,
  annotations,
  autoPrompt,
  onAutoPromptDone
}: AiPanelProps) {
  const { messages, busy, error, send } = useReaderChat(paper.id);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [effort, setEffort] = useState<Effort>('medium');
  const [showEffort, setShowEffort] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['llm-status'],
    queryFn: () => getLlmStatus()
  });
  const mock = Boolean(settingsQuery.data?.mock);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  function buildContext(): string {
    const parts: string[] = [];
    parts.push(`[Paper Metadata]Title: ${paper.title}; Author: ${paper.authors || '--'}; Journal: ${paper.journal || '--'}; Year: ${paper.year ?? '--'}; DOI: ${paper.doi || '--'}; Tag: ${(paper.tags || []).join('; ') || '--'}`);
    if (currentPageText) {
      parts.push(`[currentPage(No. ${currentPage} Page)text]${currentPageText.slice(0, 4000)}`);
    }
    if (selectionText) {
      parts.push(`[User selected text]${selectionText}`);
    }
    if (annotations.length > 0) {
      parts.push(`[Existing Annotations]${annotations.map((a) => `p.${a.page}:"${(a.selectedText || '').slice(0, 120)}"${a.comment ? `(Annotation: ${a.comment})` : ''}`).join('; ')}`);
    }
    return parts.join('\n\n');
  }

  function handleSend(text: string) {
    const prompt = text.trim();
    if (!prompt || busy) return;
    send(prompt, buildContext(), { thinking, webSearch, effort });
  }

  useEffect(() => {
    if (autoPrompt) {
      handleSend(autoPrompt.text);
      onAutoPromptDone();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPrompt]);

  return (
    <div className="ai-panel">
      <div className="ai-presets">
        {PRESETS.map((preset) => (
          <button key={preset} type="button" className="ai-preset" disabled={busy} onClick={() => handleSend(preset)}>
            {preset}
          </button>
        ))}
      </div>
      {mock && (
        <div className="ai-mock-note">
          <Bot size={12} aria-hidden="true" />
          Currently mock output(MOCK_LLM=true), Not real call LLM
        </div>
      )}
      <div className="ai-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="ai-empty">
            <p>Click above preset to ask, Or input below. </p>
            <p className="ai-empty-hint">AI Will auto get paper Metadata, Full Text, currentPagetext, Selected text and existing annotations, no needManualdescribe"Which file to read". </p>
          </div>
        )}
        {messages.map((message, index) => {
          if (message.role === 'assistant') {
            return <AssistantMessage key={index} content={message.content} />;
          }
          return (
            <div key={index} className="ai-msg is-user">
              <div className="ai-msg-content">{message.content}</div>
            </div>
          );
        })}
        {busy && (
          <div className="ai-msg is-assistant">
            <div className="ai-msg-content ai-msg-thinking">
              <Loader2 size={12} className="spin" aria-hidden="true" /> Thinking...
            </div>
          </div>
        )}
      </div>
      {error && <p className="ai-error">{error}</p>}
      <div className="ai-input-row">
        <button
          type="button"
          className={`ai-toggle-btn ${thinking ? 'is-active' : ''}`}
          title="Deep Thinking"
          onClick={() => setThinking((v) => !v)}
        >
          <Brain size={14} />
        </button>
        <button
          type="button"
          className={`ai-toggle-btn ${webSearch ? 'is-active' : ''}`}
          title="web search"
          onClick={() => setWebSearch((v) => !v)}
        >
          <Globe size={14} />
        </button>
        <button
          type="button"
          className="ai-toggle-btn ai-effort-btn"
          title="Reasoning Effort"
          onClick={() => setShowEffort((v) => !v)}
        >
          {effort === 'low' ? 'Low' : effort === 'high' ? 'High' : 'Med'}
        </button>
        {showEffort && (
          <div className="ai-effort-popover">
            {(['low', 'medium', 'high'] as Effort[]).map((e) => (
              <button
                key={e}
                className={`ai-effort-option ${effort === e ? 'is-active' : ''}`}
                onClick={() => { setEffort(e); setShowEffort(false); }}
              >
                {e === 'low' ? 'Low' : e === 'medium' ? 'Medium' : 'High'}
              </button>
            ))}
          </div>
        )}
        <input
          className="field-input"
          placeholder="to AI Ask Current Paper..."
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              handleSend(draft);
              setDraft('');
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || !draft.trim()}
          title="Send"
          onClick={() => {
            handleSend(draft);
            setDraft('');
          }}
        >
          <Send size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

function AssistantMessage({ content }: { content: string }) {
  const { thinking, answer } = useMemo(() => parseThinking(content), [content]);
  const [thinkingOpen, setThinkingOpen] = useState(true);

  return (
    <div className="ai-msg is-assistant">
      {thinking && (
        <div className="ai-thinking-block">
          <button type="button" className="ai-thinking-toggle" onClick={() => setThinkingOpen((v) => !v)}>
            {thinkingOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            <Brain size={12} />
            <span>Deep Thinking</span>
          </button>
          {thinkingOpen && <div className="ai-thinking-content">{thinking}</div>}
        </div>
      )}
      <div className="ai-msg-content">{answer || content}</div>
    </div>
  );
}
