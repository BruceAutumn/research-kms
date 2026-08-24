import { useMemo, useState, type MouseEvent } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { AlertCircle, Brain, ChevronDown, ChevronRight, StickyNote, Check } from 'lucide-react';
import ErrorCard from './ErrorCard';
import { createNote } from '../../api/client';

export interface ChatSource {
  index: number;
  type: string;
  id: number;
  title: string;
}

export interface ChatBubble {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[];
}

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (data.attrName === 'data-source') data.keepAttr = true;
});

export default function ChatPane({ messages, streaming, error }: { messages: ChatBubble[]; streaming: boolean; error?: Record<string, unknown> | null }) {
  const [hoveredSource, setHoveredSource] = useState<ChatSource | null>(null);

  function handleCitationClick(e: MouseEvent<HTMLDivElement>, sources?: ChatSource[]) {
    const target = e.target as HTMLElement;
    const cite = target.closest('.ai2-cite') as HTMLElement | null;
    if (!cite || !sources) return;
    const idx = parseInt(cite.dataset.source || '0', 10);
    const src = sources.find((s) => s.index === idx);
    if (src) {
      if (src.type === 'paper' || src.type === 'literature') {
        window.history.pushState({}, '', `/papers/${src.id}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      } else if (src.type === 'note' || src.type === 'vault') {
        window.history.pushState({}, '', `/vault?noteId=${src.id}`);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    }
  }

  function handleCitationHover(e: MouseEvent<HTMLDivElement>, sources?: ChatSource[]) {
    const target = e.target as HTMLElement;
    const cite = target.closest('.ai2-cite') as HTMLElement | null;
    if (!cite || !sources) { setHoveredSource(null); return; }
    const idx = parseInt(cite.dataset.source || '0', 10);
    const src = sources.find((s) => s.index === idx);
    setHoveredSource(src || null);
  }

  return (
    <div className="ai2-stream">
      {messages.length === 0 && <div className="ai2-empty">Start a research chat. </div>}
      {messages.map((message, index) => {
        const isLast = index === messages.length - 1;
        if (message.role === 'user') {
          return (
            <div key={index} className="ai2-bubble is-user">{message.content}</div>
          );
        }
        return <AssistantBubble key={index} content={message.content} streaming={streaming && isLast} sources={message.sources} hasContext={index > 0} onClick={handleCitationClick} onHover={handleCitationHover} />;
      })}
      {hoveredSource && (
        <div className="ai2-source-tooltip">
          <span className="ai2-source-type">{hoveredSource.type}</span>
          <span className="ai2-source-title">{hoveredSource.title}</span>
        </div>
      )}
      {error && <ErrorCard error={error} />}
    </div>
  );
}

interface AssistantProps {
  content: string;
  streaming: boolean;
  sources?: ChatSource[];
  hasContext: boolean;
  onClick: (e: MouseEvent<HTMLDivElement>, sources?: ChatSource[]) => void;
  onHover: (e: MouseEvent<HTMLDivElement>, sources?: ChatSource[]) => void;
}

function AssistantBubble({ content, streaming, sources, hasContext, onClick, onHover }: AssistantProps) {
  const { thinking, answer } = useMemo(() => {
    if (!content) return { thinking: '', answer: '' };
    const thinkPattern = /<thinking>([\s\S]*?)<\/thinking>/g;
    let thinkParts = '';
    let match;
    let remaining = content;
    while ((match = thinkPattern.exec(content)) !== null) {
      thinkParts += match[1].trim() + '\n';
    }
    remaining = remaining.replace(thinkPattern, '').trim();
    return { thinking: thinkParts.trim(), answer: remaining };
  }, [content]);

  const { html, hasCitations } = useMemo(() => {
    if (!answer) return { html: '', hasCitations: false };
    let parsed = marked.parse(answer, { breaks: true }) as string;
    const citePattern = /\[\^(\d+)\]/g;
    const found = citePattern.test(parsed);
    parsed = parsed.replace(citePattern, (_match, n) => `<sup class="ai2-cite" data-source="${n}">${n}</sup>`);
    const clean = DOMPurify.sanitize(parsed, { ADD_ATTR: ['data-source'] });
    return { html: clean, hasCitations: found };
  }, [answer]);

  const [thinkingOpen, setThinkingOpen] = useState(true);
  const showNoSourceWarning = hasContext && sources && sources.length > 0 && !hasCitations && !streaming;
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSaveAsNote() {
    if (saving || saved) return;
    setSaving(true);
    try {
      const firstLine = answer.split('\n').find((l) => l.trim()) ?? 'AI Answer';
      const title = firstLine.replace(/^#+\s*/, '').slice(0, 60);
      await createNote({ title, content: answer });
      setSaved(true);
    } catch {
      setSaving(false);
    }
  }

  return (
    <div className="ai2-bubble is-assistant">
      {thinking && (
        <div className="ai2-thinking-block">
          <button type="button" className="ai2-thinking-toggle" onClick={() => setThinkingOpen((v) => !v)}>
            {thinkingOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Brain size={13} />
            <span>Deep Thinking</span>
          </button>
          {thinkingOpen && (
            <div className="ai2-thinking-content">{thinking}</div>
          )}
        </div>
      )}
      <div className="ai2-markdown" dangerouslySetInnerHTML={{ __html: html }} onClick={(e) => onClick(e, sources)} onMouseMove={(e) => onHover(e, sources)} />
      {sources && sources.length > 0 && (
        <div className="ai2-source-list">
          {sources.map((src) => (
            <span key={src.index} className="ai2-source-ref" onClick={() => {
              if (src.type === 'paper' || src.type === 'literature') {
                window.history.pushState({}, '', `/papers/${src.id}`);
                window.dispatchEvent(new PopStateEvent('popstate'));
              }
            }}>
              [^{src.index}] {src.title}
            </span>
          ))}
        </div>
      )}
      {showNoSourceWarning && (
        <div className="ai2-no-source-warning">
          <AlertCircle size={14} /> AI Answer lacks source citation
        </div>
      )}
      {!streaming && answer && (
        <button className={`ai2-save-note-btn ${saved ? 'is-saved' : ''}`} onClick={handleSaveAsNote} disabled={saving || saved}>
          {saved ? <><Check size={12} /> SavedtoVault</> : <><StickyNote size={12} /> {saving ? 'Saving...' : 'Save as Note'}</>}
        </button>
      )}
      {streaming && <span className="ai2-cursor" />}
    </div>
  );
}
