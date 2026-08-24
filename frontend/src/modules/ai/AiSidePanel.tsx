import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BookOpen, ChevronDown, ChevronRight, Cpu, FileText, Hash, Highlighter, Plus, Settings2, StickyNote, X
} from 'lucide-react';
import { listAllAnnotations, listNotes, listPapers } from '../../api/client';
import type { LlmModel } from '../../types';
import type { AiContextRef } from './AiStudioContext';

/**
 * AI Page Right Panel. 
 *
 * Layout Reference Claude Code  Right PanelCard(Instructions / Memory / Context / Scheduled), 
 * But content replaced with real project, and put"Library"and"Vault"directly connect --
 * before need toOnepaperPaperfeed to AI, only inInputthe search box aboveintype to find, 
 * Cannot see what is in vault, equals twoModuleEachmanageEach . 
 */

interface Props {
  contextRefs: AiContextRef[];
  onContextChange: (refs: AiContextRef[]) => void;
  models: LlmModel[];
  modelId?: number;
  onManageModels: () => void;
  agentPrompt?: string;
  agentName?: string;
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
  contextRefs, onContextChange, models, modelId, onManageModels, agentPrompt, agentName
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
    <aside className="ai2-side">
      {/* Instruction: current Agent systemHint. Toshould Claude Code   Instructions.  */}
      <Card
        title="Instruction"
        icon={<Settings2 size={13} />}
        action={<button type="button" className="ai2-card-action" onClick={onManageModels}><Plus size={13} /></button>}
      >
        {agentPrompt ? (
          <>
            <div className="ai2-card-sub">{agentName || 'current Agent'}</div>
            <p className="ai2-card-text">{agentPrompt.slice(0, 220)}{agentPrompt.length > 220 ? '...' : ''}</p>
          </>
        ) : (
          <p className="ai2-card-empty">Not Selected Agent, useDefaultresearchAssistantPrompt. </p>
        )}
      </Card>

      {/* Context: Injected references. Should be visible before send.  */}
      <Card title="Context injected" icon={<Hash size={13} />} count={contextRefs.length}>
        {contextRefs.length === 0 ? (
          <p className="ai2-card-empty">not yetInjectanyPaperorNote. from belowLibrary / Click to add to vault. </p>
        ) : (
          <div className="ai2-side-chips">
            {contextRefs.map((ref) => (
              <span key={`${ref.type}:${ref.id}`} className="ai2-chip">
                {ref.type === 'note' ? <StickyNote size={11} /> : ref.type === 'annotation' ? <Highlighter size={11} /> : <FileText size={11} />}
                <span className="ai2-chip-label">{ref.label || `${ref.type}#${ref.id}`}</span>
                <button
                  type="button"
                  className="ai2-chip-remove"
                  aria-label="Remove"
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
          placeholder="filterPaper / Note..."
          onChange={(event) => setLibraryFilter(event.target.value)}
        />
      </div>

      {/* Library direct connection: Click to inject, no need toGoInputabove search.  */}
      <Card title="Library" icon={<BookOpen size={13} />} count={papersQuery.data?.length}>
        {papers.length === 0 ? (
          <p className="ai2-card-empty">{papersQuery.isLoading ? 'Loading...' : 'No matching papers. '}</p>
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

      {/* Vault direct connection */}
      <Card title="Vault" icon={<StickyNote size={13} />} count={notesQuery.data?.length}>
        {notes.length === 0 ? (
          <p className="ai2-card-empty">{notesQuery.isLoading ? 'Loading...' : 'noMatch Note. '}</p>
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
                  <span className="truncate">{note.title || '(No Title)'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Annotation direct link */}
      <Card title="Annotation" icon={<Highlighter size={13} />} count={annotationsQuery.data?.length} defaultOpen={false}>
        {(annotationsQuery.data || []).length === 0 ? (
          <p className="ai2-card-empty">{annotationsQuery.isLoading ? 'Loading...' : 'No annotations yet. '}</p>
        ) : (
          <ul className="ai2-side-list">
            {(annotationsQuery.data || []).slice(0, 12).map((ann) => (
              <li key={ann.id}>
                <button
                  type="button"
                  className={`ai2-side-item ${has('annotation', ann.id) ? 'is-on' : ''}`}
                  title={ann.selectedText || `Annotation #${ann.id}`}
                  onClick={() => toggle('annotation' as AiContextRef['type'], ann.id, `Annotation #${ann.id} (p.${ann.page})`)}
                >
                  <Highlighter size={12} />
                  <span className="truncate">{ann.selectedText ? ann.selectedText.slice(0, 40) + (ann.selectedText.length > 40 ? '...' : '') : `Annotation #${ann.id}`}</span>
                  <small>p.{ann.page}</small>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Model and API */}
      <Card title="Model and API" icon={<Cpu size={13} />} defaultOpen={false}>
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
          <p className="ai2-card-empty">Model not configured. </p>
        )}
        <button type="button" className="ai2-side-manage" onClick={onManageModels}>
          <Settings2 size={12} />Manage Provider and API Key
        </button>
      </Card>
    </aside>
  );
}
