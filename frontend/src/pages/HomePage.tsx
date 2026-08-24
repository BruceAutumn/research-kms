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
  const greeting = hour < 6 ? 'late night' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <section className="kms-hero-card" style={{ padding: 30 }}>
        <p className="kms-section-label">{greeting} . What to research today?</p>
        <h1 className="mt-2 text-4xl font-black leading-tight tracking-[-0.04em] text-slate-950">askYourVault</h1>
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 p-2 shadow-sm">
          <input
            className="min-w-0 flex-1 bg-transparent px-3 py-2 text-sm"
            placeholder="E.g.:help meOrganize PapersvaultinallPaper"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          />
          <button className="kms-primary-button" onClick={submit}>start</button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {['Organize Papers', 'Generate Review', 'Search Notes', 'Extract Metadata'].map((action) => (
            <button key={action} className="kms-secondary-button !px-3 !py-1.5 text-xs" onClick={() => setInput(`help me${action}`)}>
              {action}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="kms-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-black text-slate-900">Recent Papers</h2>
            <Link className="text-xs font-bold text-sky-600" to="/library">All -></Link>
          </div>
          {papers.map((paper) => (
            <Link key={paper.id} to={`/papers/${paper.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-sky-50">
              [doc] {paper.title}
            </Link>
          ))}
          {papers.length === 0 && <p className="text-sm text-slate-500">No papers yet,Go <Link className="font-bold text-sky-600" to="/library">Library</Link> Upload a. </p>}
        </div>

        <div className="kms-card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-black text-slate-900">Recent Notes</h2>
            <Link className="text-xs font-bold text-sky-600" to="/notes">All -></Link>
          </div>
          {notes.map((note) => (
            <Link key={note.id} to={`/notes/${note.id}`} className="block truncate rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-violet-50">
              * {note.title}
            </Link>
          ))}
          {notes.length === 0 && <p className="text-sm text-slate-500">not yetNote. </p>}
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
