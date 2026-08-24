import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, ChevronDown, ChevronRight, Cpu, FileText, Hash, Highlighter, Plus, Settings2, StickyNote, X
} from 'lucide-react';
import { listAllAnnotations, listNotes, listPapers } from '../../api/client';
import type { LlmModel } from '../../types';
import type { AiContextRef } from './AiStudioContext';

/**
 * AI 页右侧面板。
 *
 * 布局参考 Claude Code 的右栏卡片（Instructions / Memory / Context / Scheduled），
 * 但内容换成本项目真正有的东西，并且把「文献库」和「知识库」直接接进来 ——
 * 此前要把一篇文献喂给 AI，只能在输入框上方那个搜索框里打字找，
 * 看不到自己库里有什么，等于两个模块各管各的。
 */

interface Props {
  contextRefs: AiContextRef[];
  onContextChange: (refs: AiContextRef[]) => void;
  models: LlmModel[];
  modelId?: number;
  onManageModels: () => void;
  agentPrompt?: string;
  agentName?: string;
  open?: boolean;
  onClose?: () => void;
}

function Card({
  title, icon, count, defaultOpen = true, action, children
}: {
  title: string;
  icon: React.ReactNode;
  count?: number;
  defaultOpen?: boolean;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="ai2-card">
      <header className="ai2-card-head">
        <button type="button" className="ai2-card-toggle" onClick={() => setOpen((v) => !v)}>
          {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          {icon}
          <span className="ai2-card-title">{title}</span>
          {count !== undefined && <span className="ai2-card-count">{count}</span>}
        </button>
        {action}
      </header>
      {open && <div className="ai2-card-body">{children}</div>}
    </section>
  );
}

export default function AiSidePanel({
  contextRefs, onContextChange, models, modelId, onManageModels, agentPrompt, agentName, open = false, onClose
}: Props) {
  const [libraryFilter, setLibraryFilter] = useState('');

  const papersQuery = useQuery({ queryKey: ['papers', ''], queryFn: () => listPapers() });
  const notesQuery = useQuery({ queryKey: ['notes', ''], queryFn: () => listNotes() });
  const annotationsQuery = useQuery({ queryKey: ['annotations', 'all'], queryFn: () => listAllAnnotations() });

  const model = models.find((m) => m.id === modelId) ?? models.find((m) => m.isDefault) ?? models[0];

  const has = (type: string, id: number) => contextRefs.some((r) => r.type === type && r.id === id);

  const toggle = (type: AiContextRef['type'], id: number, label: string) => {
    if (has(type, id)) {
      onContextChange(contextRefs.filter((r) => !(r.type === type && r.id === id)));
    } else {
      onContextChange([...contextRefs, { type, id, label }]);
    }
  };

  const papers = useMemo(() => {
    const term = libraryFilter.trim().toLowerCase();
    const all = papersQuery.data || [];
    return (term ? all.filter((p) => p.title.toLowerCase().includes(term)) : all).slice(0, 12);
  }, [papersQuery.data, libraryFilter]);

  const notes = useMemo(() => {
    const term = libraryFilter.trim().toLowerCase();
    const all = notesQuery.data || [];
    return (term ? all.filter((n) => (n.title || '').toLowerCase().includes(term)) : all).slice(0, 12);
  }, [notesQuery.data, libraryFilter]);

  return (
    <aside className={`ai2-side ${open ? 'is-open' : ''}`}>
      {onClose && <button type="button" className="icon-btn ai2-drawer-close" aria-label="收起上下文栏" onClick={onClose}><X size={15} /></button>}
      {/* 指令：当前 Agent 的系统提示。对应 Claude Code 的 Instructions。 */}
      <Card
        title="指令"
        icon={<Settings2 size={13} />}
        action={<button type="button" className="ai2-card-action" onClick={onManageModels}><Plus size={13} /></button>}
      >
        {agentPrompt ? (
          <>
            <div className="ai2-card-sub">{agentName || '当前 Agent'}</div>
            <p className="ai2-card-text">{agentPrompt.slice(0, 220)}{agentPrompt.length > 220 ? '…' : ''}</p>
          </>
        ) : (
          <p className="ai2-card-empty">未选择 Agent，使用默认科研助手提示词。</p>
        )}
      </Card>

      {/* 上下文：已注入的引用。发送之前就该看得见。 */}
      <Card title="已注入上下文" icon={<Hash size={13} />} count={contextRefs.length}>
        {contextRefs.length === 0 ? (
          <p className="ai2-card-empty">还没有注入任何文献或笔记。从下面的文献库 / 知识库点一下即可加入。</p>
        ) : (
          <div className="ai2-side-chips">
            {contextRefs.map((ref) => (
              <span key={`${ref.type}:${ref.id}`} className="ai2-chip">
                {ref.type === 'note' ? <StickyNote size={11} /> : ref.type === 'annotation' ? <Highlighter size={11} /> : <FileText size={11} />}
                <span className="ai2-chip-label">{ref.label || `${ref.type}#${ref.id}`}</span>
                <button
                  type="button"
                  className="ai2-chip-remove"
                  aria-label="移除"
                  onClick={() => onContextChange(contextRefs.filter((r) => r !== ref))}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
      </Card>

      <div className="ai2-side-search">
        <input
          value={libraryFilter}
          placeholder="过滤文献 / 笔记…"
          onChange={(event) => setLibraryFilter(event.target.value)}
        />
      </div>

      {/* 文献库直连：点一下就注入，不用再去输入框上方搜。 */}
      <Card title="文献库" icon={<BookOpen size={13} />} count={papersQuery.data?.length}>
        {papers.length === 0 ? (
          <p className="ai2-card-empty">{papersQuery.isLoading ? '加载中…' : '没有匹配的文献。'}</p>
        ) : (
          <ul className="ai2-side-list">
            {papers.map((paper) => (
              <li key={paper.id}>
                <button
                  type="button"
                  className={`ai2-side-item ${has('paper', paper.id) ? 'is-on' : ''}`}
                  title={paper.title}
                  onClick={() => toggle('paper' as AiContextRef['type'], paper.id, paper.title)}
                >
                  <FileText size={12} />
                  <span className="truncate">{paper.title}</span>
                  {paper.year && <small>{paper.year}</small>}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 知识库直连 */}
      <Card title="知识库" icon={<StickyNote size={13} />} count={notesQuery.data?.length}>
        {notes.length === 0 ? (
          <p className="ai2-card-empty">{notesQuery.isLoading ? '加载中…' : '没有匹配的笔记。'}</p>
        ) : (
          <ul className="ai2-side-list">
            {notes.map((note) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={`ai2-side-item ${has('note', note.id) ? 'is-on' : ''}`}
                  title={note.title}
                  onClick={() => toggle('note' as AiContextRef['type'], note.id, note.title)}
                >
                  <StickyNote size={12} />
                  <span className="truncate">{note.title || '(无标题)'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 标注直连 */}
      <Card title="标注" icon={<Highlighter size={13} />} count={annotationsQuery.data?.length} defaultOpen={false}>
        {(annotationsQuery.data || []).length === 0 ? (
          <p className="ai2-card-empty">{annotationsQuery.isLoading ? '加载中…' : '还没有标注。'}</p>
        ) : (
          <ul className="ai2-side-list">
            {(annotationsQuery.data || []).slice(0, 12).map((ann) => (
              <li key={ann.id}>
                <button
                  type="button"
                  className={`ai2-side-item ${has('annotation', ann.id) ? 'is-on' : ''}`}
                  title={ann.selectedText || `标注 #${ann.id}`}
                  onClick={() => toggle('annotation' as AiContextRef['type'], ann.id, `标注 #${ann.id} (p.${ann.page})`)}
                >
                  <Highlighter size={12} />
                  <span className="truncate">{ann.selectedText ? ann.selectedText.slice(0, 40) + (ann.selectedText.length > 40 ? '…' : '') : `标注 #${ann.id}`}</span>
                  <small>p.{ann.page}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 模型与 API */}
      <Card title="模型与 API" icon={<Cpu size={13} />} defaultOpen={false}>
        {model ? (
          <div className="ai2-model-card">
            <div className="ai2-model-name">{model.displayName}</div>
            <div className="ai2-model-meta">
              <span className="ai2-model-tag">{model.providerName}</span>
              <span className="ai2-model-tag">{model.modelId}</span>
              {model.contextWindow && <span className="ai2-model-tag">ctx {(model.contextWindow / 1000).toFixed(0)}k</span>}
              <span className={`ai2-model-tag ${model.capability === 'embedding' ? 'is-embed' : 'is-chat'}`}>
                {model.capability || 'chat'}
              </span>
            </div>
          </div>
        ) : (
          <p className="ai2-card-empty">未配置模型。</p>
        )}
        <button type="button" className="ai2-side-manage" onClick={onManageModels}>
          <Settings2 size={12} />管理 Provider 与 API Key
        </button>
      </Card>
    </aside>
  );
}
