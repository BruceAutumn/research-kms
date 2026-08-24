import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, FileText, Link2, Loader2, NotebookPen, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { asSaveConflict, chatWithAi, createPaperNote, exportBibtex, getCitations, getErrorMessage, getPaperMetadata, getPaperNotes, getRelatedPapers, replacePaperMetadata, updateNoteContent, updateReadingState } from '../../../api/client';
import type { Annotation, MetadataField, Paper } from '../../../types';
import AiPanel from './AiPanel';
import type { AutoPrompt } from './AiPanel';
import { useLiterature } from '../LiteratureContext';
import { GenerateNoteDialog } from '../GenerateNoteDialog';

export type RightTab = 'ai' | 'notes' | 'metadata' | 'related';

interface RightPanelProps {
  paper: Paper;
  currentPage: number;
  currentPageText: string;
  selectionText: string | null;
  annotations: Annotation[];
  autoPrompt: AutoPrompt | null;
  onAutoPromptDone: () => void;
  initialTab?: RightTab;
}

export default function RightPanel({
  paper,
  currentPage,
  currentPageText,
  selectionText,
  annotations,
  autoPrompt,
  onAutoPromptDone,
  initialTab
}: RightPanelProps) {
  const [tab, setTab] = useState<RightTab>(initialTab || 'ai');
  const { openReader } = useLiterature();
  const queryClient = useQueryClient();
  const [noteCreating, setNoteCreating] = useState(false);
  const [noteMsg, setNoteMsg] = useState('');
  const [metadataMsg, setMetadataMsg] = useState('');
  /** Citation format select and copy hint. AllFormatOnefetch back, CutChangeno longer sendRequest.  */
  const [citationStyle, setCitationStyle] = useState<'apa' | 'ieee' | 'gbt7714' | 'bibtex'>('apa');
  const [citationCopied, setCitationCopied] = useState('');
  /** Zotero styleReadingtriage + Plugin-style AI Abstract.  */
  const [readState, setReadState] = useState<{ status: string; rating: number }>({
    status: paper.readStatus || 'unread',
    rating: paper.rating ?? 0
  });
  const [aiSummary, setAiSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [kvEditing, setKvEditing] = useState(false);
  const [kvDraft, setKvDraft] = useState<MetadataField[]>([]);
  const [kvSaving, setKvSaving] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [expandedNoteId, setExpandedNoteId] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState('');
  const [quickCapture, setQuickCapture] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaveMsg, setNoteSaveMsg] = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** currentEditNoteoptimistic lock version; Refreshed by response after save.  */
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  /** 409 Conflict: Must let user choose three-way, disallowAutoSelect.  */
  const [noteConflict, setNoteConflict] = useState<{ noteId: number; mine: string; serverContent: string; serverVersion: number } | null>(null);

  const notesQuery = useQuery({
    queryKey: ['paperNotes', paper.id],
    queryFn: () => getPaperNotes(paper.id),
  });

  const metadataQuery = useQuery({
    queryKey: ['paperMetadata', paper.id],
    queryFn: () => getPaperMetadata(paper.id)
  });

  const citationQuery = useQuery({
    queryKey: ['citations', paper.id],
    queryFn: () => getCitations(paper.id)
  });

  const relatedQuery = useQuery({
    queryKey: ['related', paper.id],
    queryFn: () => getRelatedPapers(paper.id)
  });

  const tabs: Array<{ key: RightTab; label: string; icon: React.ReactNode }> = [
    { key: 'ai', label: 'AI', icon: <Bot size={13} /> },
    { key: 'notes', label: 'Notes', icon: <NotebookPen size={13} /> },
    { key: 'metadata', label: 'Metadata', icon: <FileText size={13} /> },
    { key: 'related', label: 'Related', icon: <Link2 size={13} /> }
  ];

  return (
    <div className="right-panel">
      <div className="reader-subtabs reader-subtabs-wide" role="tablist">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={tab === item.key}
            className={`reader-subtab reader-subtab-label ${tab === item.key ? 'is-active' : ''}`}
            onClick={() => setTab(item.key)}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'ai' && (
        <AiPanel
          paper={paper}
          currentPage={currentPage}
          currentPageText={currentPageText}
          selectionText={selectionText}
          annotations={annotations}
          autoPrompt={autoPrompt}
          onAutoPromptDone={onAutoPromptDone}
        />
      )}

      {tab === 'notes' && (
        <div className="reader-notes-panel">
          {noteMsg && <p className="reader-hint" style={{ color: 'var(--accent)' }}>{noteMsg}</p>}
          <div className="rnp-header">
            <span>associateNote ({notesQuery.data?.length || 0})</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNoteDialog(true)}>
              <NotebookPen size={12} aria-hidden="true" /> Generate
            </button>
          </div>
          <div className="rnp-list">
            {(notesQuery.data || []).map(n => (
              <div key={n.id} className="rnp-item">
                <button type="button" className="rnp-item-header" onClick={() => {
                  if (expandedNoteId === n.id) { setExpandedNoteId(null); }
                  else { setExpandedNoteId(n.id); setEditingContent(n.content); setEditingVersion(n.version); setNoteConflict(null); }
                }}>
                  <span className="rnp-item-title">{n.title}</span>
                  <span className="rnp-item-meta">{n.content.split('\n').length} Line</span>
                </button>
                {expandedNoteId === n.id && (
                  <div className="rnp-item-edit">
                    <textarea
                      className="rnp-editor"
                      value={editingContent}
                      onChange={e => {
                        setEditingContent(e.target.value);
                        setNoteSaveMsg('Editing...');
                        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                        const draft = e.target.value;
                        saveTimerRef.current = setTimeout(async () => {
                          setNoteSaving(true);
                          try {
                            const saved = await updateNoteContent(n.id, draft, editingVersion);
                            setEditingVersion(saved.version);
                            setNoteSaveMsg('Saved');
                            queryClient.invalidateQueries({ queryKey: ['paperNotes', paper.id] });
                          } catch (err) {
                            // 409 = anotherOne WindowFirstSave. notAutoSelectside, hand toUser. 
                            const conflict = asSaveConflict(err);
                            if (conflict) {
                              setNoteConflict({
                                noteId: n.id,
                                mine: draft,
                                serverContent: conflict.serverContent ?? '',
                                serverVersion: conflict.serverVersion ?? 0
                              });
                              setNoteSaveMsg('Conflict Pending');
                            } else {
                              setNoteSaveMsg(`Save failed: ${getErrorMessage(err)}`);
                            }
                          }
                          finally { setNoteSaving(false); }
                        }, 800);
                      }}
                    />
                    <div className="rnp-save-status">{noteSaving ? 'Saving...' : noteSaveMsg}</div>
                    {noteConflict?.noteId === n.id && (
                      <div className="rnp-conflict">
                        <div className="rnp-conflict-title">
                          ! thisNotealready anotherOne WindowSavepass. Please choose how to handle -- will notAutodecide for you. 
                        </div>
                        <div className="rnp-conflict-panes">
                          <div>
                            <h5>my version</h5>
                            <pre>{noteConflict.mine}</pre>
                          </div>
                          <div>
                            <h5>Server Version</h5>
                            <pre>{noteConflict.serverContent}</pre>
                          </div>
                        </div>
                        <div className="rnp-conflict-actions">
                          <button
                            type="button"
                            onClick={async () => {
                              // Keep Mine: useServermostNew Versionreplay with versionOnetimeWrite. 
                              const saved = await updateNoteContent(n.id, noteConflict.mine, noteConflict.serverVersion);
                              setEditingVersion(saved.version);
                              setNoteConflict(null);
                              setNoteSaveMsg('Saved(overwriteServer)');
                              queryClient.invalidateQueries({ queryKey: ['paperNotes', paper.id] });
                            }}
                          >Keep Mine</button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingContent(noteConflict.serverContent);
                              setEditingVersion(noteConflict.serverVersion);
                              setNoteConflict(null);
                              setNoteSaveMsg('adoptedServer Version');
                            }}
                          >adoptServer</button>
                          <button
                            type="button"
                            onClick={() => {
                              // Manual Merge: put both intoEditarea, human trim. 
                              setEditingContent(
                                `<<<<<<< my version\n${noteConflict.mine}\n=======\n${noteConflict.serverContent}\n>>>>>>> Server Version`
                              );
                              setEditingVersion(noteConflict.serverVersion);
                              setNoteConflict(null);
                              setNoteSaveMsg('Inserted two copies, Please manually merge then save');
                            }}
                          >Manual Merge</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(notesQuery.data || []).length === 0 && (
              <p className="reader-hint">No Linked Notes, Click"Generate"Create. </p>
            )}
          </div>
          <div className="rnp-quick-capture">
            <input
              type="text"
              className="rnp-quick-input"
              placeholder="quick noteOnesentence, Enter to append to current note..."
              value={quickCapture}
              onChange={e => setQuickCapture(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && quickCapture.trim() && expandedNoteId) {
                  const n = notesQuery.data?.find(x => x.id === expandedNoteId);
                  if (n) {
                    // based on currentEditarea content concat, Instead of possibly stale n.content. 
                    const base = expandedNoteId === n.id ? editingContent : n.content;
                    const newContent = base + '\n\n' + quickCapture.trim();
                    const saved = await updateNoteContent(n.id, newContent, editingVersion);
                    setEditingVersion(saved.version);
                    setQuickCapture('');
                    setEditingContent(newContent);
                    queryClient.invalidateQueries({ queryKey: ['paperNotes', paper.id] });
                  }
                }
              }}
            />
          </div>
        </div>
      )}

      {tab === 'metadata' && (
        <div className="reader-metadata">
          {metadataMsg && <p className="reader-hint" style={{ color: 'var(--accent)' }}>{metadataMsg}</p>}
          <div className="rm-row"><span className="rm-label">Title</span><span className="rm-value">{paper.title}</span></div>
          <div className="rm-row"><span className="rm-label">Authors</span><span className="rm-value">{paper.authors || '--'}</span></div>
          <div className="rm-row"><span className="rm-label">Journal</span><span className="rm-value">{paper.journal || '--'}</span></div>
          <div className="rm-row"><span className="rm-label">Year</span><span className="rm-value">{paper.year ?? '--'}</span></div>
          <div className="rm-row"><span className="rm-label">DOI</span><span className="rm-value rm-mono">{paper.doi || '--'}</span></div>
          <div className="rm-row"><span className="rm-label">Volume</span><span className="rm-value">{paper.volume || '--'}</span></div>
          <div className="rm-row"><span className="rm-label">Pages</span><span className="rm-value">{paper.pages || '--'}</span></div>
          <div className="rm-row"><span className="rm-label">Tags</span><span className="rm-value">{(paper.tags || []).join(', ') || '--'}</span></div>
          {/* Zotero styleReadingtriage: read or not, value not worth re-see. Large library needs this to distinguish.  */}
          <div className="rm-section-title">Reading State</div>
          <div className="rm-reading">
            <div className="rm-status-group">
              {(['unread', 'reading', 'done'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  className={`rm-status-btn is-${status} ${readState.status === status ? 'is-on' : ''}`}
                  onClick={async () => {
                    setReadState((prev) => ({ ...prev, status }));
                    try {
                      await updateReadingState(paper.id, { readStatus: status });
                      queryClient.invalidateQueries({ queryKey: ['papers'] });
                    } catch (err) {
                      setMetadataMsg(`stateUpdateFailed: ${getErrorMessage(err)}`);
                    }
                  }}
                >* {status}</button>
              ))}
            </div>
            <div className="rm-rating" role="group" aria-label="Rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`rm-star ${readState.rating >= star ? 'is-on' : ''}`}
                  aria-label={`${star} star`}
                  onClick={async () => {
                    // Click current star again = Clear Rating, and Zotero Consistent. 
                    const next = readState.rating === star ? 0 : star;
                    setReadState((prev) => ({ ...prev, rating: next }));
                    try {
                      await updateReadingState(paper.id, { rating: next });
                      queryClient.invalidateQueries({ queryKey: ['papers'] });
                    } catch (err) {
                      setMetadataMsg(`Rating update failed: ${getErrorMessage(err)}`);
                    }
                  }}
                ><3</button>
              ))}
              {readState.rating > 0 && <span className="rm-rating-num">{readState.rating}/5</span>}
            </div>
          </div>

          {/* Plugin-style"View Abstract": Zotero Most common plugin capability.  */}
          <div className="rm-section-title">
            AI Abstract
            <button
              type="button"
              className="icon-btn rm-edit-btn"
              title="let AI based onFull TextGeneratestructuredAbstract"
              disabled={summarizing}
              onClick={async () => {
                setSummarizing(true);
                setAiSummary('');
                try {
                  const res = await chatWithAi(paper.id, [{
                    role: 'user',
                    content: 'useChinesegiveThis paperstructuredAbstract, Four Sections: research question, method, Main Conclusion, Limit. eachSegmenttwoThreesentence, involveDatawhenAnnotationPage Number. '
                  }]);
                  setAiSummary(res.reply);
                } catch (err) {
                  setAiSummary(`Generate failed: ${getErrorMessage(err)}`);
                } finally {
                  setSummarizing(false);
                }
              }}
            >
              {summarizing ? <Loader2 size={11} className="rm-spin" /> : <Sparkles size={11} />}
            </button>
          </div>
          {aiSummary
            ? <div className="rm-ai-summary">{aiSummary}</div>
            : <p className="reader-hint">{summarizing ? 'Based on full-text search and generating...' : 'Click above to generate structured summary(goFull-text Search, not only currentPage). '}</p>}

          {/* Citation: Zotero mostCoreAndbefore fullyMissing Oneenv -- Readcan directlyReference.  */}
          <div className="rm-section-title">Citation</div>
          <div className="rm-citation">
            <div className="rm-citation-bar">
              <select
                className="rm-citation-style"
                value={citationStyle}
                onChange={(event) => setCitationStyle(event.target.value as typeof citationStyle)}
              >
                <option value="apa">APA 7</option>
                <option value="ieee">IEEE</option>
                <option value="gbt7714">GB/T 7714</option>
                <option value="bibtex">BibTeX</option>
              </select>
              <button
                type="button"
                className="btn"
                disabled={!citationQuery.data}
                onClick={async () => {
                  const text = citationQuery.data?.[citationStyle];
                  if (!text) return;
                  await navigator.clipboard.writeText(text);
                  setCitationCopied('Copied');
                  window.setTimeout(() => setCitationCopied(''), 1600);
                }}
              >Copy</button>
              <button
                type="button"
                className="btn"
                title="Export whole vault as .bib"
                onClick={async () => {
                  const bib = await exportBibtex();
                  await navigator.clipboard.writeText(bib);
                  setCitationCopied('full vault BibTeX Copied');
                  window.setTimeout(() => setCitationCopied(''), 2200);
                }}
              >export full vault .bib</button>
              {citationCopied && <span className="rm-citation-copied">{citationCopied}</span>}
            </div>
            <pre className="rm-citation-text">
              {citationQuery.data?.[citationStyle] ?? (citationQuery.isError ? 'Citation generation failed' : 'Generating...')}
            </pre>
            {citationQuery.data && !paper.journal && !paper.doi && (
              <p className="reader-hint">
                ! This paper lacks journal / DOI / Volume Issue, Citation will be incomplete. fill above Metadata Citation auto-updates after. 
              </p>
            )}
          </div>

          <div className="rm-section-title">Abstract</div>
          <p className="rm-abstract">{paper.abstract || '--'}</p>
          <div className="rm-section-title">
            AI Metadata(KV)
            {!kvEditing && (
              <button type="button" className="icon-btn rm-edit-btn" title="Edit KV Metadata" onClick={() => { setKvDraft(metadataQuery.data || []); setKvEditing(true); }}>
                <Pencil size={11} aria-hidden="true" />
              </button>
            )}
          </div>
          {kvEditing ? (
            <div className="rm-kv-edit">
              {kvDraft.map((field, index) => (
                <div key={index} className="rm-kv-edit-row">
                  <input
                    className="field-input rm-kv-edit-key"
                    placeholder="Field Name"
                    value={field.key}
                    onChange={(event) => {
                      const next = [...kvDraft];
                      next[index] = { ...next[index], key: event.target.value };
                      setKvDraft(next);
                    }}
                  />
                  <input
                    className="field-input rm-kv-edit-val"
                    placeholder="value"
                    value={field.value}
                    onChange={(event) => {
                      const next = [...kvDraft];
                      next[index] = { ...next[index], value: event.target.value };
                      setKvDraft(next);
                    }}
                  />
                  <button type="button" className="icon-btn" title="Delete" onClick={() => setKvDraft(kvDraft.filter((_, i) => i !== index))}>
                    <Trash2 size={11} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="rm-kv-edit-actions">
                <button type="button" className="btn" onClick={() => setKvDraft([...kvDraft, { key: '', value: '' }])}>
                  <Plus size={11} aria-hidden="true" /> Add Field
                </button>
                <button type="button" className="btn btn-primary" disabled={kvSaving} onClick={async () => {
                  setKvSaving(true);
                  try {
                    const result = await replacePaperMetadata(paper.id, kvDraft.filter((f) => f.key.trim()));
                    await queryClient.invalidateQueries({ queryKey: ['paperMetadata', paper.id] });
                    if (result.overwrittenKeys.length > 0) {
                      setMetadataMsg(`Saved, But detected duplicate field ${result.overwrittenKeys.join(', ')}, Only kept last filled value. `);
                    } else {
                      setMetadataMsg('KV Metadata saved');
                    }
                    setKvEditing(false);
                  } catch (err) {
                    setMetadataMsg(`Save failed: ${getErrorMessage(err)}`);
                  } finally {
                    setKvSaving(false);
                  }
                }}>
                  <Save size={11} aria-hidden="true" /> {kvSaving ? 'Saving...' : 'Save'}
                </button>
                <button type="button" className="btn" onClick={() => setKvEditing(false)}>Cancel</button>
              </div>
            </div>
          ) : (metadataQuery.data || []).length === 0 ? (
            <div className="rm-kv-empty">
              <p className="reader-hint">No KV Metadata</p>
              <button type="button" className="btn" onClick={() => { setKvDraft([{ key: '', value: '' }]); setKvEditing(true); }}>
                <Plus size={11} aria-hidden="true" /> Add Custom Field
              </button>
            </div>
          ) : (
            <>
              {(metadataQuery.data || []).map((field) => (
                <div key={field.key} className="rm-row">
                  <span className="rm-label">{field.key}</span>
                  <span className="rm-value">{field.value}</span>
                </div>
              ))}
              <button type="button" className="btn rm-kv-add-btn" onClick={() => { setKvDraft([...(metadataQuery.data || []), { key: '', value: '' }]); setKvEditing(true); }}>
                <Plus size={11} aria-hidden="true" /> Add Field
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'related' && (
        <div className="reader-related">
          {(relatedQuery.data || []).length === 0 && (
            <p className="reader-hint">same Collection / sameTagrelatedPaperwill show herein. </p>
          )}
          {(relatedQuery.data || []).map((related) => (
            <button key={related.id} type="button" className="related-item" onClick={() => openReader(related)}>
              <span className="related-title">{related.title}</span>
              <span className="related-meta">
                {related.authors || '--'} . {related.year ?? '--'} . {related.journal || '--'}
              </span>
            </button>
          ))}
        </div>
      )}
      {showNoteDialog && (
        <GenerateNoteDialog
          paperId={paper.id}
          paperTitle={paper.title}
          onClose={() => setShowNoteDialog(false)}
          onCreated={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['vault', 'table'] }),
              queryClient.invalidateQueries({ queryKey: ['vault', 'tree'] })
            ]);
            setNoteMsg('Note written Vault');
          }}
        />
      )}
    </div>
  );
}
