import { useEffect, useState, useCallback } from 'react';
import { X, FileText, Sparkles, Save, Loader2 } from 'lucide-react';
import { listNoteTemplates, previewPaperNote, createPaperNote, getErrorMessage } from '../../api/client';
import type { NoteTemplate, NotePreviewResult } from '../../api/client';

interface Props {
  paperId: number;
  paperTitle: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}

export function GenerateNoteDialog({ paperId, paperTitle, onClose }: Props) {
  const [templates, setTemplates] = useState<NoteTemplate[]>([]);
  const [templateId, setTemplateId] = useState<number | null>(null);
  const [content, setContent] = useState('');
  const [preview, setPreview] = useState<NotePreviewResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvingAi, setResolvingAi] = useState(false);
  const [filename, setFilename] = useState('');
  const [folder, setFolder] = useState('');
  const [conflictStrategy, setConflictStrategy] = useState('DUPLICATE');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    listNoteTemplates().then(ts => {
      setTemplates(ts);
      const def = ts.find(t => t.isDefault) || ts[0];
      if (def) setTemplateId(def.id);
    }).catch(e => setMsg(getErrorMessage(e)));
  }, []);

  const doPreview = useCallback(async (tid: number, resolveAi: boolean) => {
    setLoading(true);
    try {
      const r = await previewPaperNote(paperId, tid, resolveAi);
      setPreview(r);
      setContent(r.renderedMarkdown);
      if (r.suggestedPath) {
        const parts = r.suggestedPath.split('/');
        if (parts.length > 1) setFolder(parts.slice(0, -1).join('/'));
        setFilename(parts[parts.length - 1]);
      }
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setLoading(false);
      setResolvingAi(false);
    }
  }, [paperId]);

  useEffect(() => {
    if (templateId) doPreview(templateId, false);
  }, [templateId, doPreview]);

  const handleResolveAi = async () => {
    if (!templateId) return;
    setResolvingAi(true);
    await doPreview(templateId, true);
  };

  const handleSave = async () => {
    setSaving(true);
    setMsg('');
    try {
      await createPaperNote(paperId, { content, folder, filename, conflictStrategy });
      setMsg(`alreadyWrite: ${folder}/${filename}`);
      onClose();
    } catch (e) {
      setMsg(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="gnd-overlay" onClick={onClose}>
      <div className="gnd-dialog" onClick={e => e.stopPropagation()}>
        <div className="gnd-header">
          <h2>Generate Note</h2>
          <button className="icon-btn" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="gnd-toolbar">
          <label>Template</label>
          <select value={templateId ?? ''} onChange={e => setTemplateId(Number(e.target.value))}>
            {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.isDefault ? ' (Default)' : ''}</option>)}
          </select>
          <button className="btn" onClick={handleResolveAi} disabled={resolvingAi || !preview?.aiPlaceholders.length}>
            {resolvingAi ? <Loader2 size={12} className="spin" /> : <Sparkles size={12} />}
            Generate AI Paragraph{preview?.aiPlaceholders.length ? ` (${preview.aiPlaceholders.length})` : ''}
          </button>
          <div className="gnd-mode-switch">
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>Edit</button>
            <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>Preview</button>
          </div>
        </div>

        <div className="gnd-body">
          {loading ? (
            <div className="gnd-loading"><Loader2 size={24} className="spin" /> Loading...</div>
          ) : mode === 'edit' ? (
            <textarea className="gnd-editor" value={content} onChange={e => setContent(e.target.value)} />
          ) : (
            <pre className="gnd-preview">{content}</pre>
          )}
        </div>

        <div className="gnd-footer">
          <div className="gnd-path-row">
            <label>Save to</label>
            <input className="gnd-folder" value={folder} onChange={e => setFolder(e.target.value)} placeholder="ResearchVault" />
            <span>/</span>
            <input className="gnd-filename" value={filename} onChange={e => setFilename(e.target.value)} placeholder="note.md" />
          </div>
          <div className="gnd-conflict">
            <label>Conflict Strategy</label>
            <select value={conflictStrategy} onChange={e => setConflictStrategy(e.target.value)}>
              <option value="DUPLICATE">New Copy</option>
              <option value="OVERWRITE">overwrite</option>
              <option value="APPEND">Append to End</option>
            </select>
          </div>
          {msg && <div className="gnd-msg">{msg}</div>}
          <div className="gnd-actions">
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave} disabled={saving || !content.trim()}>
              {saving ? <Loader2 size={12} className="spin" /> : <Save size={12} />} Write Vault
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}