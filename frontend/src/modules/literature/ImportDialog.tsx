import { useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Check,
  FileText,
  FolderUp,
  Hash,
  Loader2,
  Quote,
  X
} from 'lucide-react';
import { getErrorMessage, importBibtex, importByDoi } from '../../api/client';
import type { ImportBibtexResult, Paper } from '../../types';
import { useLiterature } from './LiteratureContext';
import type { ImportMode } from './LiteratureContext';
import { usePdfBatchUpload } from './batchUpload';

interface ImportDialogProps {
  mode: ImportMode;
  onClose: () => void;
}

export default function ImportDialog({ mode, onClose }: ImportDialogProps) {
  const queryClient = useQueryClient();
  const { openReader } = useLiterature();
  const [current, setCurrent] = useState<ImportMode>(mode);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const bibInputRef = useRef<HTMLInputElement | null>(null);
  const [doi, setDoi] = useState('');
  const [doiBusy, setDoiBusy] = useState(false);
  const [doiError, setDoiError] = useState('');
  const [bibText, setBibText] = useState('');
  const [bibBusy, setBibBusy] = useState(false);
  const [bibError, setBibError] = useState('');
  const [bibResult, setBibResult] = useState<ImportBibtexResult | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const batch = usePdfBatchUpload((paper: Paper) => {
    void queryClient.invalidateQueries({ queryKey: ['papers'] });
  });

  const tabs: Array<{ key: ImportMode; label: string; icon: React.ReactNode }> = [
    { key: 'pdf', label: 'import PDF', icon: <FileText size={13} /> },
    { key: 'folder', label: 'importFolder', icon: <FolderUp size={13} /> },
    { key: 'doi', label: 'import DOI', icon: <Hash size={13} /> },
    { key: 'bibtex', label: 'import BibTeX', icon: <Quote size={13} /> }
  ];

  function onPdfFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) void batch.start(files);
    event.target.value = '';
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    void batch.start(Array.from(event.dataTransfer.files || []));
  }

  async function runDoi() {
    const value = doi.trim();
    if (!value || doiBusy) return;
    setDoiBusy(true);
    setDoiError('');
    try {
      const paper = await importByDoi(value);
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
      setDoi('');
      openReader(paper);
      onClose();
    } catch (err) {
      setDoiError(getErrorMessage(err));
    } finally {
      setDoiBusy(false);
    }
  }

  async function runBibtex() {
    if (!bibText.trim() || bibBusy) return;
    setBibBusy(true);
    setBibError('');
    setBibResult(null);
    try {
      const result = await importBibtex(bibText);
      setBibResult(result);
      await queryClient.invalidateQueries({ queryKey: ['papers'] });
    } catch (err) {
      setBibError(getErrorMessage(err));
    } finally {
      setBibBusy(false);
    }
  }

  async function onBibFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBibText(await file.text());
    event.target.value = '';
  }

  const doneCount = batch.items.filter((item) => item.status === 'done').length;
  const errorCount = batch.items.filter((item) => item.status === 'error').length;

  return (
    <div className="dialog-shell" role="dialog" aria-modal="true">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog dialog-import">
        <div className="dialog-header">
          <span className="dialog-title">import</span>
          <button type="button" className="icon-btn" aria-label="close" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="dialog-tabs" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={current === tab.key}
              className={`dialog-tab ${current === tab.key ? 'is-active' : ''}`}
              onClick={() => {
                setCurrent(tab.key);
                setBibResult(null);
                setBibError('');
                setDoiError('');
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
        <div className="dialog-body">
          {(current === 'pdf' || current === 'folder') && (
            <div>
              <div
                className={`import-drop ${dragOver ? 'is-dragover' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
              >
                <p className="import-drop-title">
                  {current === 'pdf' ? 'Select or drag PDF File' : 'Select a folder, Batch import PDF'}
                </p>
                <p className="import-drop-hint">
                  {current === 'pdf'
                    ? 'Auto use after upload PDFBox Read inline properties(Title / Author / dayIssue), No Call LLM. '
                    : 'Batch import per-item progress, Single file failure skip and log, Does not break batch. '}
                </p>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  multiple={current === 'pdf'}
                  className="visually-hidden"
                  onChange={onPdfFiles}
                />
                <input
                  ref={folderInputRef}
                  type="file"
                  className="visually-hidden"
                  onChange={onPdfFiles}
                  {...(current === 'folder' ? { webkitdirectory: '', directory: '' } : {})}
                />
                <div className="import-drop-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => (current === 'pdf' ? pdfInputRef.current?.click() : folderInputRef.current?.click())}
                  >
                    {current === 'pdf' ? 'Select PDF File' : 'Select Folder'}
                  </button>
                </div>
              </div>
              {batch.items.length > 0 && (
                <div className="import-progress">
                  <div className="import-progress-head">
                    <span>
                      Progress: {doneCount + errorCount}/{batch.items.length}
                      {batch.running ? ' Uploading...' : ' Done'}
                    </span>
                    <span className="import-progress-summary">
                      <span className="import-ok">Success {doneCount}</span>
                      <span className="import-err">Failed {errorCount}</span>
                    </span>
                  </div>
                  <div className="import-progress-list">
                    {batch.items.map((item, index) => (
                      <div key={`${item.file.name}-${index}`} className={`import-progress-row is-${item.status}`}>
                        <span className="import-progress-icon">
                          {item.status === 'uploading' && <Loader2 size={12} className="spin" aria-hidden="true" />}
                          {item.status === 'done' && <Check size={12} aria-hidden="true" />}
                          {item.status === 'error' && <X size={12} aria-hidden="true" />}
                          {item.status === 'pending' && <FileText size={12} aria-hidden="true" />}
                        </span>
                        <span className="import-progress-name">{item.file.name}</span>
                        <span className="import-progress-status">
                          {item.status === 'error' ? item.message : item.status === 'done' ? 'In DB' : item.status === 'uploading' ? 'Uploading' : 'Waiting'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {current === 'doi' && (
            <div className="import-form">
              <div className="field">
                <span className="field-label">DOI</span>
                <input
                  className="field-input"
                  autoFocus
                  value={doi}
                  placeholder="E.g.: 10.1016/j.cej.2023.144826"
                  onChange={(event) => setDoi(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void runDoi();
                  }}
                />
              </div>
              <p className="form-note">via Crossref Query bibliographic info(Title / Authors / Journal / Year / Abstract), No Call LLM. </p>
              {doiError && <p className="form-error">{doiError}</p>}
              <button type="button" className="btn btn-primary" disabled={!doi.trim() || doiBusy} onClick={() => void runDoi()}>
                {doiBusy ? 'Querying...' : 'Query and import'}
              </button>
            </div>
          )}

          {current === 'bibtex' && (
            <div className="import-form">
              <div className="field">
                <span className="field-label">BibTeX content</span>
                <textarea
                  className="field-input import-bibtex"
                  value={bibText}
                  placeholder={'@article{key,\n  title = {...},\n  author = {...},\n  year = {2024}\n}'}
                  onChange={(event) => setBibText(event.target.value)}
                />
              </div>
              <div className="import-form-row">
                <button type="button" className="btn" onClick={() => bibInputRef.current?.click()}>
                  open .bib File
                </button>
                <input ref={bibInputRef} type="file" accept=".bib,text/plain" className="visually-hidden" onChange={onBibFile} />
                <button type="button" className="btn btn-primary" disabled={!bibText.trim() || bibBusy} onClick={() => void runBibtex()}>
                  {bibBusy ? 'Importing...' : 'import'}
                </button>
              </div>
              {bibError && <p className="form-error">{bibError}</p>}
              {bibResult && (
                <div className="import-progress">
                  <div className="import-progress-head">
                    <span>importDone: Success {bibResult.created.length}  , Failed {bibResult.errors.length}  </span>
                  </div>
                  <div className="import-progress-list">
                    {bibResult.created.map((paper) => (
                      <div key={paper.id} className="import-progress-row is-done">
                        <span className="import-progress-icon"><Check size={12} /></span>
                        <span className="import-progress-name">{paper.title}</span>
                      </div>
                    ))}
                    {bibResult.errors.map((err, index) => (
                      <div key={index} className="import-progress-row is-error">
                        <span className="import-progress-icon"><X size={12} /></span>
                        <span className="import-progress-name">No. {err.index + 1}  </span>
                        <span className="import-progress-status">{err.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
