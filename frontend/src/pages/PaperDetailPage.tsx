import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  createPaperNote,
  deletePaper,
  extractPaperMetadata,
  getErrorMessage,
  getPaper,
  getPaperMetadata,
  paperFileUrl,
  replacePaperMetadata,
  updatePaper
} from '../api/client';
import MetadataReviewPanel from '../components/MetadataReviewPanel';
import PdfViewer from '../components/PdfViewer';
import StatusMessage from '../components/StatusMessage';
import type { MetadataField, Paper } from '../types';

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function PaperDetailPage() {
  const { id } = useParams();
  const paperId = Number(id);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const splitRef = useRef<HTMLDivElement | null>(null);
  const [paper, setPaper] = useState<Paper | null>(null);
  const [metadata, setMetadata] = useState<MetadataField[]>([]);
  const [draftTags, setDraftTags] = useState('');
  const [reviewFields, setReviewFields] = useState<MetadataField[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [infoPaneWidth, setInfoPaneWidth] = useState(460);

  async function load() {
    setError('');
    try {
      const [paperData, metadataData] = await Promise.all([getPaper(paperId), getPaperMetadata(paperId)]);
      setPaper(paperData);
      setMetadata(metadataData);
      setDraftTags((paperData.tags || []).join(', '));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    if (paperId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  useEffect(() => {
    // fromLibrary"AI Extract Metadata"Auto extract on button jump. 
    if (paperId && searchParams.get('extract') === '1') {
      setInfo('AI Extracting...');
      extractPaperMetadata(paperId)
        .then((result) => { setReviewFields(result.fields); setInfo('AI suggestReady,after reviewSave. '); })
        .catch((err) => { setError(getErrorMessage(err)); setInfo(''); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId]);

  function startPaperSplitResize(event: ReactPointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const rect = splitRef.current?.getBoundingClientRect();
    if (!rect) return;
    const containerLeft = rect.left;
    const containerWidth = rect.width;
    document.body.classList.add('is-resizing');

    function onPointerMove(moveEvent: PointerEvent) {
      const nextWidth = moveEvent.clientX - containerLeft;
      setInfoPaneWidth(clamp(nextWidth, 340, Math.max(360, containerWidth - 460)));
    }

    function onPointerUp() {
      document.body.classList.remove('is-resizing');
      window.removeEventListener('pointermove', onPointerMove);
    }

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once: true });
  }

  if (!paper) {
    return <StatusMessage error={error} info={!error ? 'Loading paper...' : undefined} />;
  }

  async function savePaper() {
    if (!paper) return;
    setError('');
    try {
      const saved = await updatePaper(paper.id, { ...paper, tags: draftTags.split(',').map((t) => t.trim()).filter(Boolean) });
      setPaper(saved);
      setInfo('Paper saved. ');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function runExtract() {
    setError('');
    setInfo('AI Extracting...');
    try {
      const result = await extractPaperMetadata(paperId);
      setReviewFields(result.fields);
      setInfo('AI suggestReady,after reviewSave. ');
    } catch (err) {
      setError(getErrorMessage(err));
      setInfo('');
    }
  }

  async function saveAccepted(fields: MetadataField[]) {
    setError('');
    const merged = [...metadata];
    for (const field of fields) {
      const index = merged.findIndex((item) => item.key === field.key);
      if (index >= 0) merged[index] = field;
      else merged.push(field);
    }
    try {
      const result = await replacePaperMetadata(paperId, merged);
      setMetadata(result.fields);
      setReviewFields(null);
      if (result.overwrittenKeys.length > 0) {
        setInfo(`Metadata saved, But detected duplicate field ${result.overwrittenKeys.join(', ')}, Only kept last filled value. `);
      } else {
        setInfo('Metadata saved. ');
      }
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function createNote() {
    setError('');
    try {
      const note = await createPaperNote(paperId);
      navigate(`/notes/${note.id}`);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function removePaper() {
    if (!window.confirm('Confirm delete this paper and PDF File??')) return;
    await deletePaper(paperId);
    navigate('/library');
  }

  return (
    <div className="space-y-4">
      <div className="paper-detail-header">
        <div>
          <Link to="/library" className="text-sm font-semibold text-sky-600"><- BackLibrary</Link>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">{paper.title}</h1>
          <p className="mt-1 text-sm text-slate-500">Drag middle divider,Can adjust left form and right PDF Reading area width. </p>
        </div>
        <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100" onClick={removePaper}>Delete</button>
      </div>

      <StatusMessage error={error} info={info} />

      <div
        ref={splitRef}
        className="paper-detail-split"
        style={{ gridTemplateColumns: `${infoPaneWidth}px 10px minmax(420px, 1fr)` }}
      >
        <section className="space-y-4 overflow-auto pr-1">
          <div className="kms-card p-4">
            <h2 className="mb-3 text-lg font-black text-slate-900">Paper Info</h2>
            <div className="space-y-3 text-sm">
              <label className="block font-semibold text-slate-700">Title<input className="kms-input mt-1 w-full" value={paper.title} onChange={(e) => setPaper({ ...paper, title: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">Author<input className="kms-input mt-1 w-full" value={paper.authors || ''} onChange={(e) => setPaper({ ...paper, authors: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">Journal<input className="kms-input mt-1 w-full" value={paper.journal || ''} onChange={(e) => setPaper({ ...paper, journal: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">Year<input type="number" className="kms-input mt-1 w-full" value={paper.year || ''} onChange={(e) => setPaper({ ...paper, year: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="block font-semibold text-slate-700">DOI<input className="kms-input mt-1 w-full" value={paper.doi || ''} onChange={(e) => setPaper({ ...paper, doi: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">Abstract<textarea className="kms-input mt-1 h-28 w-full" value={paper.abstract || ''} onChange={(e) => setPaper({ ...paper, abstract: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">Tag<input className="kms-input mt-1 w-full" value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="commaSeparate" /></label>
              <button className="kms-secondary-button" onClick={savePaper}>Save Paper</button>
            </div>
          </div>

          <div className="kms-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">Metadata</h2>
              <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => setMetadata([...metadata, { key: '', value: '' }])}>+ Field</button>
            </div>
            <div className="space-y-2">
              {metadata.map((field, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input className="kms-input px-2 py-1 text-sm" value={field.key} onChange={(e) => setMetadata((old) => old.map((it, i) => (i === index ? { ...it, key: e.target.value } : it)))} />
                  <input className="kms-input px-2 py-1 text-sm" value={field.value || ''} onChange={(e) => setMetadata((old) => old.map((it, i) => (i === index ? { ...it, value: e.target.value } : it)))} />
                  <button className="rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600" onClick={() => setMetadata((old) => old.filter((_, i) => i !== index))}>Delete</button>
                </div>
              ))}
              {metadata.length === 0 && <p className="text-sm text-slate-500">No Metadata. </p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="kms-primary-button" onClick={runExtract}>* AI extract</button>
              <button className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-600" onClick={createNote}>[note] Generate Note</button>
              <button className="kms-secondary-button" onClick={async () => { const r = await replacePaperMetadata(paperId, metadata.filter((m) => m.key.trim())); setMetadata(r.fields); if (r.overwrittenKeys.length > 0) setInfo(`Saved, Duplicate Field ${r.overwrittenKeys.join(', ')} Only keep last value. `); }}>Save Metadata</button>
            </div>
          </div>

          {reviewFields && <MetadataReviewPanel fields={reviewFields} onSave={saveAccepted} onClose={() => setReviewFields(null)} />}
        </section>

        <div
          className="kms-inner-resizer"
          onPointerDown={startPaperSplitResize}
          title="Drag adjust paper info / PDF Reader Width"
        />

        <section className="min-w-0 overflow-hidden">
          <PdfViewer url={paperFileUrl(paperId)} />
        </section>
      </div>
    </div>
  );
}
