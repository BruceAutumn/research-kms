import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage, listNotes, listPapers } from '../api/client';
import type { Note, Paper } from '../types';

export default function HomePage() {
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listPapers(), listNotes()])
      .then(([p, n]) => { setPapers(p.slice(0, 5)); setNotes(n.slice(0, 5)); })
      .catch((err) => setError(getErrorMessage(err)));
  }, []);

  function submit() {
    const text = input.trim();
    if (!text) return;
    navigate(`/agents?instruction=${encodeURIComponent(text)}`);
  }

  const hour = new Date().getHours();
  const greeting = hour < 6 ? '夜深了' : hour < 12 ? '早上好' : hour < 18 ? '下午好' : '晚上好';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="kms-hero-card" style={{ padding: 30 }}>
        <p className="kms-section-label">{greeting} · 今天研究点什么?</p>
        <h1 className="mt-2 text-4xl font-black leading-tight tracking-[-0.04em] text-slate-950">问你的知识库</h1>
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-sm">
          <input
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm"
            placeholder="例如:帮我整理文献库里的所有论文"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button className="kms-primary-button" onClick={submit}>开始</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {['整理文献', '生成综述', '搜索笔记', '提取元数据'].map((action) => (
            <button key={action} className="kms-secondary-button !px-3 !py-1.5 text-xs" onClick={() => setInput(`帮我${action}`)}>
              {action}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="kms-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-black text-slate-900">最近文献</h2>
            <Link className="text-xs font-bold text-sky-600" to="/library">全部 →</Link>
          </div>
          {papers.map((paper) => (
            <Link key={paper.id} to={`/papers/${paper.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-sky-50">
              📄 {paper.title}
            </Link>
          ))}
          {papers.length === 0 && <p className="text-sm text-slate-500">还没有文献,去 <Link className="font-bold text-sky-600" to="/library">文献库</Link> 上传一篇。</p>}
        </div>

        <div className="kms-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-black text-slate-900">最近笔记</h2>
            <Link className="text-xs font-bold text-sky-600" to="/notes">全部 →</Link>
          </div>
          {notes.map((note) => (
            <Link key={note.id} to={`/notes/${note.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-violet-50">
              ✎ {note.title}
            </Link>
          ))}
          {notes.length === 0 && <p className="text-sm text-slate-500">还没有笔记。</p>}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
