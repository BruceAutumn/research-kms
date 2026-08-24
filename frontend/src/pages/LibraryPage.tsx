import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPaperNote, getErrorMessage, listPapers, semanticSearch, uploadPaper } from '../api/client';
import type { SemanticSearchResult } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { Paper } from '../types';

const collections = [
  { key: 'all', label: 'All Papers', icon: '[]' },
  { key: 'recent', label: 'Recent Uploads', icon: 'o' },
  { key: 'no_metadata', label: 'Pending Metadata Extraction', icon: '*' },
  { key: 'with_notes', label: 'Existing Note', icon: '*' },
  { key: 'no_notes', label: 'To-Read Papers', icon: '*' }
];

function formatTags(tags: string[]) {
  return tags.length > 0 ? tags : ['No Tags'];
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
    setBusy('Generating paper note...');
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
            <p className="kms-section-label">set</p>
            <h1 className="mt-1 text-xl font-black tracking-[-0.035em] text-slate-950">Library</h1>
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
          <div className="mb-2 text-xs font-black uppercase tracking-[0.18em] text-slate-400">Tag Filter</div>
          <input className="kms-input w-full" placeholder="E.g. battery / COF" value={tag} onChange={(e) => setTag(e.target.value)} />
          <button className="kms-secondary-button mt-3 w-full" onClick={() => refresh()}>Apply Filter</button>
        </div>
      </aside>

      <div
        className="library-column-resizer"
        onPointerDown={(event) => startLibraryResize('collections', event)}
        title="Drag Adjust Collections / Paper Table Width"
      />

      <section className="kms-card library-table-pane">
        <div className="library-toolbar">
          <label className="kms-primary-button cursor-pointer">
            Upload PDF
            <input type="file" accept="application/pdf" className="hidden" onChange={onFileChange} />
          </label>
          <input className="kms-input min-w-0 flex-1" placeholder={semanticMode ? 'Semantic Search: Input natural language query' : 'Search Title / Author'} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }} />
          <button className={`kms-secondary-button ${semanticMode ? 'is-active' : ''}`} onClick={() => { setSemanticMode(!semanticMode); }} title="Toggle Semantic Search">{semanticMode ? '[search] Semantic' : '[abc] Keywords'}</button>
          <button className="kms-secondary-button" onClick={() => refresh()}>search</button>
        </div>

        <StatusMessage error={error} info={loading ? 'Loading paper...' : busy || undefined} />

        <div className="paper-table-header">
          <span>Title</span>
          <span>Author</span>
          <span>Journal</span>
          <span>Year</span>
          <span>Tag</span>
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
                <span className="truncate font-black">[doc] {paper.title}</span>
                {sr?.snippet && (
                  <span className="mt-0.5 truncate text-[11px] font-normal text-slate-500" title={sr.snippet}>
                    {sr.page != null ? `p.${sr.page} . ` : ''}{sr.snippet}
                  </span>
                )}
              </span>
              <span className="truncate text-slate-500">{paper.authors || '--'}</span>
              <span className="truncate text-slate-500">{paper.journal || '--'}</span>
              <span className="text-slate-500">{paper.year || '--'}</span>
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
              <div className="text-5xl">[doc]</div>
              <div className="mt-4 text-lg font-black text-slate-900">No papers yet</div>
              <p className="mt-2 max-w-md text-sm leading-6">Upload a PDF after,it will appear inListin;Click to read,then use AI extract metadata. </p>
            </div>
          )}
        </div>
      </section>

      <div
        className="library-column-resizer"
        onPointerDown={(event) => startLibraryResize('detail', event)}
        title="Drag adjust paper table / Item Detail width"
      />

      <aside className="kms-card library-detail-pane">
        <p className="kms-section-label">Paper Details</p>
        {selectedPaper ? (
          <>
            <h2 className="mt-3 text-2xl font-black leading-tight tracking-[-0.04em] text-slate-950">{selectedPaper.title}</h2>
            <div className="mt-4 space-y-3 text-sm">
              <div className="detail-field"><span>Author</span><strong>{selectedPaper.authors || 'To Be Supplemented'}</strong></div>
              <div className="detail-field"><span>Journal</span><strong>{selectedPaper.journal || 'To Be Supplemented'}</strong></div>
              <div className="detail-field"><span>Year</span><strong>{selectedPaper.year || 'To Be Supplemented'}</strong></div>
              <div className="detail-field"><span>DOI</span><strong>{selectedPaper.doi || 'To Be Supplemented'}</strong></div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {formatTags(selectedPaper.tags).map((paperTag, index) => (
                <span key={paperTag} className={index === 0 ? 'tag-blue' : 'tag-purple'}>{paperTag}</span>
              ))}
            </div>
            <div className="mt-6 space-y-2">
              <button className="kms-primary-button w-full" onClick={() => navigate(`/papers/${selectedPaper.id}`)}>Open Reader</button>
              <button className="kms-secondary-button w-full" onClick={() => navigate(`/papers/${selectedPaper.id}?extract=1`)}>* AI Extract Metadata</button>
              <button className="kms-secondary-button w-full" onClick={makeNote}>[note] Generate Paper Note</button>
            </div>
          </>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">After select or upload a paper,thisinshow details. </div>
        )}
      </aside>
    </div>
  );
}
