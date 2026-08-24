import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getErrorMessage, listNotes } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { Note } from '../types';

export default function NotesPage() {
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');

  async function refresh() {
    try {
      setNotes(await listNotes(q));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">笔记</h1>
          <p className="text-sm text-slate-500">Obsidian 风格 Markdown + [[双链]]。</p>
        </div>
        <Link className="rounded bg-indigo-600 px-4 py-2 text-white" to="/notes/new">新建笔记</Link>
      </div>
      <StatusMessage error={error} />
      <div className="flex gap-2 rounded-xl bg-white p-3 shadow-sm">
        <input className="flex-1 rounded border px-3 py-2" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索笔记" onKeyDown={(e) => { if (e.key === 'Enter') refresh(); }} />
        <button className="rounded bg-slate-900 px-4 py-2 text-white" onClick={refresh}>搜索</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {notes.map((note) => (
          <button key={note.id} className="rounded-xl bg-white p-4 text-left shadow-sm hover:ring-2 hover:ring-indigo-200" onClick={() => navigate(`/notes/${note.id}`)}>
            <h2 className="font-semibold">{note.title}</h2>
            <p className="mt-2 line-clamp-3 text-sm text-slate-500">{note.content}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
