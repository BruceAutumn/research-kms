import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPaperNote, getErrorMessage, listPapers, semanticSearch, uploadPaper } from '../api/client';
import type { SemanticSearchResult } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { Paper } from '../types';

const collections = [
  { key: 'all', label: '全部文献', icon: '▣' },
  { key: 'recent', label: '最近上传', icon: '◷' },
  { key: 'no_metadata', label: '待提取元数据', icon: '✦' },
  { key: 'with_notes', label: '已有笔记', icon: '✎' },
  { key: 'no_notes', label: '待读论文', icon: '●' }
];

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags : ['无标签'];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function LibraryPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const [papers, setPapers] = useState<Paper[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collectionWidth, setCollectionWidth] = useState(230);
  const [detailWidth, setDetailWidth] = useState(300);
  const [q, setQ] = useState(searchParams.get('q') || '');
  const [tag, setTag] = useState('');
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [semanticMode, setSemanticMode] = useState(false);
  const [semanticResults, setSemanticResults] = useState<SemanticSearchResult['papers']>([]);

  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedId) ?? papers[0],
    [papers, selectedId]
  );

  async function refresh(nextFilter: string = filter) {
    setError('');
    setLoading(true);
    try {
      if (semanticMode && q.trim()) {
        const results = await semanticSearch(q, 'papers', 20);
        setSemanticResults(results.papers);
        const ids = results.papers.map((r) => r.id);
        if (ids.length > 0) {
          const allPapers = await listPapers('', '', 'all');
          setPapers(allPapers.filter((p) => ids.includes(p.id)));
        } else {
          setPapers([]);
        }
      } else {
        setSemanticResults([]);
        const nextPapers = await listPapers(q, tag, nextFilter);
        setPapers(nextPapers);
      }
      if (papers.length > 0 && !papers.some((paper) => paper.id === selectedId)) {
        setSelectedId(papers[0]?.id ?? null);
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCollection(key: string) {
    setFilter(key);
    refresh(key);
  }

  function startLibraryResize(side: 'collections' | 'detail', event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = workspaceRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = rect.left;
    const right = rect.right;
    document.body.classList.add('is-resizing');

    function onPointerMove(moveEvent: PointerEvent) {
      if (side === 'collections') {
        setCollectionWidth(clamp(moveEvent.clientX - left, 180, 360));
      } else {
        setDetailWidth(clamp(right - moveEvent.clientX, 220, 460));
      }
    }

    function onPointerUp() {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onPointerMove);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  async function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const paper = await uploadPaper(file);
      navigate(`/papers/${paper.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      event.target.value = '';
    }
  }

  async function makeNote() {
    if (!selectedPaper) return;
    setBusy('正在生成文献笔记…');
    setError('');
    try {
      const note = await createPaperNote(selectedPaper.id);
      navigate(`/notes/${note.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy('');
    }
  }

  return (
    <div
      ref={workspaceRef}
      className="library-workspace"
      style={{ gridTemplateColumns: `${collectionWidth}px 8px minmax(520px, 1fr) 8px ${detailWidth}px` }}
    >
      <aside className="kms-card library-collections">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="kms-section-label">集合</p>
            <h1 className="mt-1 text-xl font-black tracking-[-0.035em] text-slate-950">文献库</h1>
          </div>
          <span className="rounded-xl bg-sky-100 px-2 py-1 text-sm font-black text-sky-700">{papers.length}</span>
        </div>

        <div className="space-y-1.5">
          {collections.map((collection) => (
            <button
              key={collection.key}
              className={`collection-row ${filter === collection.key ? 'is-active' : ''}`}
              type="button"
              onClick={() => selectCollection(collection.key)}
            >
              <span>{collection.icon}</span>
              <span className="truncate font-black">{collection.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-auto rounded-2xl border border-slate-200 bg-white/80 p-3 shadow-sm">
          <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">标签筛选</div>
          <input className="kms-input w-full" placeholder="例如 battery / COF" value={tag} onChange={(e) => setTag(e.target.value)} />
          <button className="kms-secondary-button mt-3 w-full" onClick={() => refresh()}>应用筛选</button>
        </div>
      </aside>

      <div
        className="library-column-resizer"
        onPointerDown={(event) => startLibraryResize('collections', event)}
        title="拖动调节 Collections / 文献表格宽度"
      />

      <section className="kms-card library-table-pane">
        <div className="library-toolbar">
          <label className="kms-primary-button cursor-pointer">
            上传 PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
          </label>
          <input className="kms-input min-w-0 flex-1" placeholder={semanticMode ? '语义搜索：输入自然语言查询' : '搜索标题 / 作者'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }} />
          <button className={`kms-secondary-button ${semanticMode ? 'is-active' : ''}`} onClick={() => { setSemanticMode(!semanticMode); }} title="切换语义搜索">{semanticMode ? '🔍 语义' : '🔤 关键词'}</button>
          <button className="kms-secondary-button" onClick={() => refresh()}>搜索</button>
        </div>

        <StatusMessage error={error} info={loading ? '加载文献中…' : busy || undefined} />

        <div className="paper-table-header">
          <span>标题</span>
          <span>作者</span>
          <span>期刊</span>
          <span>年份</span>
          <span>标签</span>
        </div>

        <div className="paper-table-body">
          {papers.map((paper) => {
            const sr = semanticResults.find((r) => r.id === paper.id);
            return (
            <button
              key={paper.id}
              type="button"
              className={`paper-row ${selectedPaper?.id === paper.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(paper.id)}
              onDoubleClick={() => navigate(`/papers/${paper.id}`)}
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-black">📄 {paper.title}</span>
                {sr?.snippet && (
                  <span className="mt-0.5 truncate text-[11px] font-normal text-slate-500" title={sr.snippet}>
                    {sr.page != null ? `p.${sr.page} · ` : ''}{sr.snippet}
                  </span>
                )}
              </span>
              <span className="truncate text-slate-500">{paper.authors || '—'}</span>
              <span className="truncate text-slate-500">{paper.journal || '—'}</span>
              <span className="text-slate-500">{paper.year || '—'}</span>
              <span className="flex min-w-0 flex-wrap gap-1.5">
                {sr && <span className="tag-green">{(sr.similarity * 100).toFixed(0)}%</span>}
                {formatTags(paper.tags).slice(0, 3).map((paperTag, index) => (
                  <span key={`${paper.id}-${paperTag}`} className={index === 0 ? 'tag-blue' : index === 1 ? 'tag-green' : 'tag-purple'}>{paperTag}</span>
                ))}
              </span>
            </button>
            );
          })}
          {papers.length === 0 && (
            <div className="flex h-80 flex-col items-center justify-center text-center text-slate-500">
              <div className="text-5xl">📄</div>
              <div className="mt-4 text-lg font-black text-slate-900">还没有文献</div>
              <p className="mt-2 max-w-md text-sm leading-6">上传一篇 PDF 后,它会出现在这个列表里;点开可阅读,随后用 AI 提取 metadata。</p>
            </div>
          )}
        </div>
      </section>

      <div
        className="library-column-resizer"
        onPointerDown={(event) => startLibraryResize('detail', event)}
        title="拖动调节文献表格 / Item Detail 宽度"
      />

      <aside className="kms-card library-detail-pane">
        <p className="kms-section-label">文献详情</p>
        {selectedPaper ? (
          <>
            <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.04em] text-slate-950">{selectedPaper.title}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="detail-field"><span>作者</span><strong>{selectedPaper.authors || '待补充'}</strong></div>
              <div className="detail-field"><span>期刊</span><strong>{selectedPaper.journal || '待补充'}</strong></div>
              <div className="detail-field"><span>年份</span><strong>{selectedPaper.year || '待补充'}</strong></div>
              <div className="detail-field"><span>DOI</span><strong>{selectedPaper.doi || '待补充'}</strong></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {formatTags(selectedPaper.tags).map((paperTag, index) => (
                <span key={paperTag} className={index === 0 ? 'tag-blue' : 'tag-purple'}>{paperTag}</span>
              ))}
            </div>
            <div className="mt-6 space-y-2">
              <button className="kms-primary-button w-full" onClick={() => navigate(`/papers/${selectedPaper.id}`)}>打开阅读器</button>
              <button className="kms-secondary-button w-full" onClick={() => navigate(`/papers/${selectedPaper.id}?extract=1`)}>✨ AI 提取元数据</button>
              <button className="kms-secondary-button w-full" onClick={makeNote}>📝 生成文献笔记</button>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">选择或上传一篇论文后,这里显示详情。</div>
        )}
      </aside>
    </div>
  );
}
