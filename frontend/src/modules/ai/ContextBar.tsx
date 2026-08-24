import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Hash, Plus, StickyNote, X } from 'lucide-react';
import { resolveAiContext, suggestAiContext } from '../../api/client';
import type { AiContextRef } from './AiStudioContext';

/**
 * Injected context visibility. 
 *
 * Step 7 delivered AiContextService + AiContextController + Frontend API function, But no UI --
 * Nothing visible before send"Which papers fed this chat". Source list after answer(Step 9   [^N] anchorPoint)
 * is post-hoc, followSendpreviousVisibleare two things, cannot substitute. 
 */

const TOKEN_WARN_RATIO = 0.8;
const DEFAULT_CONTEXT_WINDOW = 128000;

interface Props {
  refs: AiContextRef[];
  onChange: (refs: AiContextRef[]) => void;
  /** currentSelectModel contextWindow, to check if over limit.  */
  contextWindow?: number;
  /** by Composer  "+ Add Context"Button Driven.  */
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
}

function iconFor(type: string) {
  if (type === 'note' || type === 'vault') return <StickyNote size={12} aria-hidden="true" />;
  if (type === 'tag') return <Hash size={12} aria-hidden="true" />;
  return <FileText size={12} aria-hidden="true" />;
}

function labelFor(ref: AiContextRef, resolvedTitles: Map<string, string>) {
  const key = `${ref.type}:${ref.id ?? ref.path ?? ''}`;
  return ref.label || resolvedTitles.get(key) || key;
}

function sameRef(a: AiContextRef, b: AiContextRef) {
  return a.type === b.type && a.id === b.id && a.path === b.path;
}

export default function ContextBar({ refs, onChange, contextWindow, pickerOpen, onPickerOpenChange }: Props) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<Array<{ type: string; id: number; label: string }>>([]);
  const [tokens, setTokens] = useState<number | null>(null);
  const [resolveError, setResolveError] = useState('');
  const [resolvedTitles, setResolvedTitles] = useState<Map<string, string>>(new Map());
  const inputRef = useRef<HTMLInputElement | null>(null);

  const limit = contextWindow && contextWindow > 0 ? contextWindow : DEFAULT_CONTEXT_WINDOW;

  // Suggest papers on input(GET /api/ai/context/suggest before thisOnenobodyCall). 
  useEffect(() => {
    if (!pickerOpen) return;
    const term = query.trim();
    if (!term) {
      setItems([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      suggestAiContext(term)
        .then((res) => {
          if (!cancelled) setItems(res.items || []);
        })
        .catch(() => {
          if (!cancelled) setItems([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, pickerOpen]);

  useEffect(() => {
    if (pickerOpen) inputRef.current?.focus();
  }, [pickerOpen]);

  // estimate token occupy: Real backend call resolve, Not frontend guessing char count. 
  useEffect(() => {
    if (refs.length === 0) {
      setTokens(0);
      setResolveError('');
      setResolvedTitles(new Map());
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      resolveAiContext(refs.map((r) => ({ type: r.type, id: r.id, value: r.path })))
        .then((res) => {
          if (cancelled) return;
          setTokens(res.totalTokens ?? 0);
          setResolveError('');
          const titles = new Map<string, string>();
          for (const block of res.blocks || []) {
            if (block.title) titles.set(`${block.type}:${block.id ?? ''}`, block.title);
          }
          setResolvedTitles(titles);
        })
        .catch((err) => {
          if (cancelled) return;
          setTokens(null);
          // parseFailedMustspeak out: otherwise"Context injected"is unverifiable assert. 
          setResolveError(err instanceof Error ? err.message : 'Context parse failed');
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [refs]);

  const overLimit = tokens != null && tokens > limit;
  const nearLimit = tokens != null && !overLimit && tokens > limit * TOKEN_WARN_RATIO;

  const suggestions = useMemo(
    () => items.filter((item) => !refs.some((r) => r.type === item.type && r.id === item.id)),
    [items, refs]
  );

  if (refs.length === 0 && !pickerOpen) return null;

  return (
    <div className="ai2-contextbar">
      <div className="ai2-context-chips">
        {refs.map((ref) => {
          const key = `${ref.type}:${ref.id ?? ref.path ?? ''}`;
          return (
            <span key={key} className={`ai2-chip is-${ref.type}`} title={labelFor(ref, resolvedTitles)}>
              {iconFor(ref.type)}
              <span className="ai2-chip-label">{labelFor(ref, resolvedTitles)}</span>
              <button
                type="button"
                className="ai2-chip-remove"
                aria-label={`Remove ${labelFor(ref, resolvedTitles)}`}
                onClick={() => onChange(refs.filter((r) => !sameRef(r, ref)))}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          );
        })}

        {!pickerOpen && (
          <button type="button" className="ai2-chip is-add" onClick={() => onPickerOpenChange(true)}>
            <Plus size={12} aria-hidden="true" />Add
          </button>
        )}

        <span className="ai2-context-spacer" />

        {resolveError && (
          <span className="ai2-context-tokens is-error">
            <AlertTriangle size={12} aria-hidden="true" />{resolveError}
          </span>
        )}
        {!resolveError && tokens != null && refs.length > 0 && (
          <span className={`ai2-context-tokens ${overLimit ? 'is-error' : nearLimit ? 'is-warn' : ''}`}>
            {(overLimit || nearLimit) && <AlertTriangle size={12} aria-hidden="true" />}
            ~={tokens.toLocaleString()} / {limit.toLocaleString()} tokens
            {overLimit && ' . exceededModelContext, Please remove some content before send'}
            {nearLimit && ' . near limit'}
          </span>
        )}
      </div>

      {pickerOpen && (
        <div className="ai2-context-picker">
          <input
            ref={inputRef}
            value={query}
            placeholder="Search Papers / Note / Tag..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onPickerOpenChange(false);
                setQuery('');
              }
            }}
          />
          <button type="button" className="icon-btn" title="close" onClick={() => { onPickerOpenChange(false); setQuery(''); }}>
            <X size={14} aria-hidden="true" />
          </button>
          {suggestions.length > 0 && (
            <ul className="ai2-context-suggestions">
              {suggestions.map((item) => (
                <li key={`${item.type}-${item.id}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange([...refs, { type: item.type as AiContextRef['type'], id: item.id, label: item.label }]);
                      setQuery('');
                    }}
                  >
                    {iconFor(item.type)}
                    <span className="truncate">{item.label}</span>
                    <small>{item.type}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {query.trim() && suggestions.length === 0 && (
            <div className="ai2-context-empty">No matching papers / Note</div>
          )}
        </div>
      )}
    </div>
  );
}
