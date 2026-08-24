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
    // 从文献库「AI 提取元数据」按钮跳转而来时自动触发一次提取。
    if (paperId && searchParams.get('extract') === '1') {
      setInfo('AI 提取中…');
      extractPaperMetadata(paperId)
        .then((result) => { setReviewFields(result.fields); setInfo('AI 建议已就绪,审阅后保存。'); })
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
    return <StatusMessage error={error} info={!error ? '加载论文中…' : undefined} />;
  }

  async function savePaper() {
    if (!paper) return;
    setError('');
    try {
      const saved = await updatePaper(paper.id, { ...paper, tags: draftTags.split(',').map((t) => t.trim()).filter(Boolean) });
      setPaper(saved);
      setInfo('论文已保存。');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function runExtract() {
    setError('');
    setInfo('AI 提取中…');
    try {
      const result = await extractPaperMetadata(paperId);
      setReviewFields(result.fields);
      setInfo('AI 建议已就绪,审阅后保存。');
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
        setInfo(`元数据已保存，但检测到重复字段 ${result.overwrittenKeys.join('、')}，仅保留了最后一次填写的值。`);
      } else {
        setInfo('元数据已保存。');
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
    if (!window.confirm('确定删除这篇论文及其 PDF 文件吗?')) return;
    await deletePaper(paperId);
    navigate('/library');
  }

  return (
    <div className="space-y-4">
      <div className="paper-detail-header">
        <div>
          <Link to="/library" className="text-sm font-semibold text-sky-600">← 返回文献库</Link>
          <h1 className="mt-1 text-3xl font-black tracking-[-0.04em] text-slate-950">{paper.title}</h1>
          <p className="mt-1 text-sm text-slate-500">拖动中间分隔条,可以调节左侧元信息表单和右侧 PDF 阅读区的宽度。</p>
        </div>
        <button className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-bold text-red-600 hover:bg-red-100" onClick={removePaper}>删除</button>
      </div>

      <StatusMessage error={error} info={info} />

      <div
        ref={splitRef}
        className="paper-detail-split"
        style={{ gridTemplateColumns: `${infoPaneWidth}px 10px minmax(420px, 1fr)` }}
      >
        <section className="space-y-4 overflow-auto pr-1">
          <div className="kms-card p-4">
            <h2 className="mb-3 text-lg font-black text-slate-900">论文信息</h2>
            <div className="space-y-3 text-sm">
              <label className="block font-semibold text-slate-700">标题<input className="kms-input mt-1 w-full" value={paper.title} onChange={(e) => setPaper({ ...paper, title: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">作者<input className="kms-input mt-1 w-full" value={paper.authors || ''} onChange={(e) => setPaper({ ...paper, authors: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">期刊<input className="kms-input mt-1 w-full" value={paper.journal || ''} onChange={(e) => setPaper({ ...paper, journal: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">年份<input type="number" className="kms-input mt-1 w-full" value={paper.year || ''} onChange={(e) => setPaper({ ...paper, year: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="block font-semibold text-slate-700">DOI<input className="kms-input mt-1 w-full" value={paper.doi || ''} onChange={(e) => setPaper({ ...paper, doi: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">摘要<textarea className="kms-input mt-1 h-28 w-full" value={paper.abstract || ''} onChange={(e) => setPaper({ ...paper, abstract: e.target.value })} /></label>
              <label className="block font-semibold text-slate-700">标签<input className="kms-input mt-1 w-full" value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="逗号分隔" /></label>
              <button className="kms-secondary-button" onClick={savePaper}>保存论文</button>
            </div>
          </div>

          <div className="kms-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">元数据</h2>
              <button className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => setMetadata([...metadata, { key: '', value: '' }])}>+ 字段</button>
            </div>
            <div className="space-y-2">
              {metadata.map((field, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input className="kms-input px-2 py-1 text-sm" value={field.key} onChange={(e) => setMetadata((old) => old.map((it, i) => (i === index ? { ...it, key: e.target.value } : it)))} />
                  <input className="kms-input px-2 py-1 text-sm" value={field.value || ''} onChange={(e) => setMetadata((old) => old.map((it, i) => (i === index ? { ...it, value: e.target.value } : it)))} />
                  <button className="rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-600" onClick={() => setMetadata((old) => old.filter((_, i) => i !== index))}>删除</button>
                </div>
              ))}
              {metadata.length === 0 && <p className="text-sm text-slate-500">暂无元数据。</p>}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <button className="kms-primary-button" onClick={runExtract}>✨ AI 提取</button>
              <button className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white shadow-sm hover:bg-emerald-600" onClick={createNote}>📝 生成笔记</button>
              <button className="kms-secondary-button" onClick={async () => { const r = await replacePaperMetadata(paperId, metadata.filter((m) => m.key.trim())); setMetadata(r.fields); if (r.overwrittenKeys.length > 0) setInfo(`已保存，重复字段 ${r.overwrittenKeys.join('、')} 仅保留最后值。`); }}>保存元数据</button>
            </div>
          </div>

          {reviewFields && <MetadataReviewPanel fields={reviewFields} onSave={saveAccepted} onClose={() => setReviewFields(null)} />}
        </section>

        <div
          className="kms-inner-resizer"
          onPointerDown={startPaperSplitResize}
          title="拖动调节论文信息 / PDF 阅读器宽度"
        />

        <section className="min-w-0 overflow-hidden">
          <PdfViewer url={paperFileUrl(paperId)} />
        </section>
      </div>
    </div>
  );
}
