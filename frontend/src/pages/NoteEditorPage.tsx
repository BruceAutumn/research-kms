import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { createNote, deleteNote, getBacklinks, getErrorMessage, getNote, listNotes, updateNote } from '../api/client';
import MarkdownPreview from '../components/MarkdownPreview';
import StatusMessage from '../components/StatusMessage';
import type { Note } from '../types';

export default function NoteEditorPage() {
  const { id } = useParams();
  const noteId = id ? Number(id) : undefined;
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState(searchParams.get('title') || 'Unnamed');
  const [content, setContent] = useState('');
  const [properties, setProperties] = useState<Record<string, unknown>>({});
  const [paperId, setPaperId] = useState<number | undefined>();
  const [backlinks, setBacklinks] = useState<Note[]>([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function loadList() {
    setNotes(await listNotes());
  }

  useEffect(() => {
    loadList().catch((err) => setError(getErrorMessage(err)));
  }, []);

  useEffect(() => {
    setError('');
    setInfo('');
    if (!noteId) {
      setTitle(searchParams.get('title') || 'Unnamed');
      setContent('');
      setProperties({});
      setPaperId(undefined);
      setBacklinks([]);
      return;
    }
    Promise.all([getNote(noteId), getBacklinks(noteId)])
      .then(([note, links]) => {
        setTitle(note.title);
        setContent(note.content);
        setProperties(note.properties || {});
        setPaperId(note.paperId);
        setBacklinks(links);
      })
      .catch((err) => setError(getErrorMessage(err)));
  }, [noteId, searchParams]);

  async function save() {
    setError('');
    try {
      const payload = { title, content, properties, paperId };
      const saved = noteId ? await updateNote(noteId, payload) : await createNote(payload);
      setInfo('Saved,Backlinks re-parsed. ');
      await loadList();
      if (!noteId) navigate(`/notes/${saved.id}`);
      else setBacklinks(await getBacklinks(saved.id));
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function remove() {
    if (!noteId || !window.confirm('Confirm delete this note??')) return;
    await deleteNote(noteId);
    navigate('/notes');
  }

  return (
    <div className="grid h-[calc(100vh-4rem)] gap-4 lg:grid-cols-[260px_1fr]">
      <aside className="overflow-auto rounded-xl bg-white p-3 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">Note</h2>
          <Link className="text-sm text-indigo-600" to="/notes/new">New</Link>
        </div>
        <div className="space-y-1">
          {notes.map((note) => (
            <Link key={note.id} className={`block rounded px-2 py-2 text-sm hover:bg-slate-100 ${note.id === noteId ? 'bg-indigo-50 text-indigo-700' : ''}`} to={`/notes/${note.id}`}>
              {note.title}
            </Link>
          ))}
        </div>
      </aside>

      <section className="flex min-w-0 flex-col space-y-3">
        <div className="flex items-center gap-2">
          <input className="flex-1 rounded border bg-white px-3 py-2 text-xl font-semibold" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button className="rounded bg-indigo-600 px-4 py-2 text-white" onClick={save}>Save</button>
          {noteId && <button className="rounded border border-red-200 px-4 py-2 text-red-600" onClick={remove}>Delete</button>}
        </div>
        <StatusMessage error={error} info={info} />
        <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-2">
          <textarea className="min-h-0 rounded-xl border bg-white p-4 font-mono text-sm leading-6 shadow-sm" value={content} onChange={(e) => setContent(e.target.value)} placeholder="write Markdown,try [[anotherOnepaperNote]]. " />
          <div className="min-h-0 overflow-auto">
            <MarkdownPreview content={content} />
          </div>
        </div>
        <div className="rounded-xl bg-white p-3 text-sm shadow-sm">
          <h3 className="font-semibold">Backlinks</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {backlinks.map((note) => <Link key={note.id} className="rounded bg-slate-100 px-2 py-1 text-indigo-700" to={`/notes/${note.id}`}>{note.title}</Link>)}
            {backlinks.length === 0 && <span className="text-slate-500">No Backlinks. </span>}
          </div>
        </div>
      </section>
    </div>
  );
}
