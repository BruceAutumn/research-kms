import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, FileText, Hash, Plus, StickyNote, X } from 'lucide-react';
import { resolveAiContext, suggestAiContext } from '../../api/client';
import type { AiContextRef } from './AiStudioContext';

/**
 * 已注入上下文的可见性。
 *
 * Step 7 交付了 AiContextService + AiContextController + 前端 API 函数，但没有任何 UI ——
 * 发送之前完全看不到「这次对话喂进去了哪几篇」。回答之后的来源列表（Step 9 的 [^N] 锚点）
 * 是事后追溯，跟发送之前的可见性是两件事，不能互相顶替。
 */

const TOKEN_WARN_RATIO = 0.8;
const DEFAULT_CONTEXT_WINDOW = 128000;

interface Props {
  refs: AiContextRef[];
  onChange: (refs: AiContextRef[]) => void;
  /** 当前所选模型的上下文窗口，用来判断是否超限。 */
  contextWindow?: number;
  /** 由 Composer 的「+ 添加上下文」按钮驱动。 */
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

  // 输入时建议相关文献（GET /api/ai/context/suggest 此前一直没人调）。
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

  // 预估 token 占用：真去后端 resolve，而不是前端瞎猜字符数。
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
          // 解析失败必须说出来：否则「上下文已注入」是个无从验证的断言。
          setResolveError(err instanceof Error ? err.message : '上下文解析失败');
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
                aria-label={`移除 ${labelFor(ref, resolvedTitles)}`}
                onClick={() => onChange(refs.filter((r) => !sameRef(r, ref)))}
              >
                <X size={11} aria-hidden="true" />
              </button>
            </span>
          );
        })}

        {!pickerOpen && (
          <button type="button" className="ai2-chip is-add" onClick={() => onPickerOpenChange(true)}>
            <Plus size={12} aria-hidden="true" />添加
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
            ≈{tokens.toLocaleString()} / {limit.toLocaleString()} tokens
            {overLimit && ' · 已超出模型上下文，发送前请移除部分内容'}
            {nearLimit && ' · 接近上限'}
          </span>
        )}
      </div>

      {pickerOpen && (
        <div className="ai2-context-picker">
          <input
            ref={inputRef}
            value={query}
            placeholder="搜索文献 / 笔记 / 标签…"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                onPickerOpenChange(false);
                setQuery('');
              }
            }}
          />
          <button type="button" className="icon-btn" title="关闭" onClick={() => { onPickerOpenChange(false); setQuery(''); }}>
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
            <div className="ai2-context-empty">没有匹配的文献 / 笔记</div>
          )}
        </div>
      )}
    </div>
  );
}
