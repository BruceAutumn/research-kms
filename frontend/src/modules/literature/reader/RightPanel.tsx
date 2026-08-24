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
  /** 引文格式选择与复制提示。全部格式一次取回，切换不再发请求。 */
  const [citationStyle, setCitationStyle] = useState<'apa' | 'ieee' | 'gbt7714' | 'bibtex'>('apa');
  const [citationCopied, setCitationCopied] = useState('');
  /** Zotero 式阅读分诊 + 插件式 AI 摘要。 */
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
  /** 当前编辑笔记的乐观锁版本号；保存成功后由响应刷新。 */
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  /** 409 冲突：必须让用户三选一，不许自动选。 */
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
            <span>关联笔记 ({notesQuery.data?.length || 0})</span>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setShowNoteDialog(true)}>
              <NotebookPen size={12} aria-hidden="true" /> 生成
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
                  <span className="rnp-item-meta">{n.content.split('\n').length} 行</span>
                </button>
                {expandedNoteId === n.id && (
                  <div className="rnp-item-edit">
                    <textarea
                      className="rnp-editor"
                      value={editingContent}
                      onChange={e => {
                        setEditingContent(e.target.value);
                        setNoteSaveMsg('编辑中…');
                        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
                        const draft = e.target.value;
                        saveTimerRef.current = setTimeout(async () => {
                          setNoteSaving(true);
                          try {
                            const saved = await updateNoteContent(n.id, draft, editingVersion);
                            setEditingVersion(saved.version);
                            setNoteSaveMsg('已保存');
                            queryClient.invalidateQueries({ queryKey: ['paperNotes', paper.id] });
                          } catch (err) {
                            // 409 = 另一个窗口先保存了。不自动选边，交给用户。
                            const conflict = asSaveConflict(err);
                            if (conflict) {
                              setNoteConflict({
                                noteId: n.id,
                                mine: draft,
                                serverContent: conflict.serverContent ?? '',
                                serverVersion: conflict.serverVersion ?? 0
                              });
                              setNoteSaveMsg('冲突待处理');
                            } else {
                              setNoteSaveMsg(`保存失败：${getErrorMessage(err)}`);
                            }
                          }
                          finally { setNoteSaving(false); }
                        }, 800);
                      }}
                    />
                    <div className="rnp-save-status">{noteSaving ? '保存中…' : noteSaveMsg}</div>
                    {noteConflict?.noteId === n.id && (
                      <div className="rnp-conflict">
                        <div className="rnp-conflict-title">
                          ⚠ 这篇笔记已被另一个窗口保存过。请选择如何处理 —— 不会自动替你决定。
                        </div>
                        <div className="rnp-conflict-panes">
                          <div>
                            <h5>我的版本</h5>
                            <pre>{noteConflict.mine}</pre>
                          </div>
                          <div>
                            <h5>服务端版本</h5>
                            <pre>{noteConflict.serverContent}</pre>
                          </div>
                        </div>
                        <div className="rnp-conflict-actions">
                          <button
                            type="button"
                            onClick={async () => {
                              // 保留我的：用服务端最新版本号重放一次写入。
                              const saved = await updateNoteContent(n.id, noteConflict.mine, noteConflict.serverVersion);
                              setEditingVersion(saved.version);
                              setNoteConflict(null);
                              setNoteSaveMsg('已保存（覆盖服务端）');
                              queryClient.invalidateQueries({ queryKey: ['paperNotes', paper.id] });
                            }}
                          >保留我的</button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingContent(noteConflict.serverContent);
                              setEditingVersion(noteConflict.serverVersion);
                              setNoteConflict(null);
                              setNoteSaveMsg('已采用服务端版本');
                            }}
                          >采用服务端</button>
                          <button
                            type="button"
                            onClick={() => {
                              // 手动合并：把两份都放进编辑区，由人来裁剪。
                              setEditingContent(
                                `<<<<<<< 我的版本\n${noteConflict.mine}\n=======\n${noteConflict.serverContent}\n>>>>>>> 服务端版本`
                              );
                              setEditingVersion(noteConflict.serverVersion);
                              setNoteConflict(null);
                              setNoteSaveMsg('已插入两份内容，请手动合并后保存');
                            }}
                          >手动合并</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
            {(notesQuery.data || []).length === 0 && (
              <p className="reader-hint">暂无关联笔记，点击「生成」创建。</p>
            )}
          </div>
          <div className="rnp-quick-capture">
            <input
              type="text"
              className="rnp-quick-input"
              placeholder="随手记一句，回车追加到当前笔记…"
              value={quickCapture}
              onChange={e => setQuickCapture(e.target.value)}
              onKeyDown={async e => {
                if (e.key === 'Enter' && quickCapture.trim() && expandedNoteId) {
                  const n = notesQuery.data?.find(x => x.id === expandedNoteId);
                  if (n) {
                    // 基于当前编辑区内容拼接，而不是可能已过期的 n.content。
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
          <div className="rm-row"><span className="rm-label">Authors</span><span className="rm-value">{paper.authors || '—'}</span></div>
          <div className="rm-row"><span className="rm-label">Journal</span><span className="rm-value">{paper.journal || '—'}</span></div>
          <div className="rm-row"><span className="rm-label">Year</span><span className="rm-value">{paper.year ?? '—'}</span></div>
          <div className="rm-row"><span className="rm-label">DOI</span><span className="rm-value rm-mono">{paper.doi || '—'}</span></div>
          <div className="rm-row"><span className="rm-label">Volume</span><span className="rm-value">{paper.volume || '—'}</span></div>
          <div className="rm-row"><span className="rm-label">Pages</span><span className="rm-value">{paper.pages || '—'}</span></div>
          <div className="rm-row"><span className="rm-label">Tags</span><span className="rm-value">{(paper.tags || []).join(', ') || '—'}</span></div>
          {/* Zotero 式阅读分诊：读没读、值不值得再看。库一大没有这个就分不清了。 */}
          <div className="rm-section-title">阅读状态</div>
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
                      setMetadataMsg(`状态更新失败：${getErrorMessage(err)}`);
                    }
                  }}
                >● {status}</button>
              ))}
            </div>
            <div className="rm-rating" role="group" aria-label="评级">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`rm-star ${readState.rating >= star ? 'is-on' : ''}`}
                  aria-label={`${star} 星`}
                  onClick={async () => {
                    // 再点当前星级 = 清除评级，和 Zotero 一致。
                    const next = readState.rating === star ? 0 : star;
                    setReadState((prev) => ({ ...prev, rating: next }));
                    try {
                      await updateReadingState(paper.id, { rating: next });
                      queryClient.invalidateQueries({ queryKey: ['papers'] });
                    } catch (err) {
                      setMetadataMsg(`评级更新失败：${getErrorMessage(err)}`);
                    }
                  }}
                >♥</button>
              ))}
              {readState.rating > 0 && <span className="rm-rating-num">{readState.rating}/5</span>}
            </div>
          </div>

          {/* 插件式「查看摘要」：Zotero 生态里最常用的一类插件能力。 */}
          <div className="rm-section-title">
            AI 摘要
            <button
              type="button"
              className="icon-btn rm-edit-btn"
              title="让 AI 基于全文生成结构化摘要"
              disabled={summarizing}
              onClick={async () => {
                setSummarizing(true);
                setAiSummary('');
                try {
                  const res = await chatWithAi(paper.id, [{
                    role: 'user',
                    content: '用中文给出这篇论文的结构化摘要，分四段：研究问题、方法、主要结论、局限。每段两三句话，涉及数据时标注页码。'
                  }]);
                  setAiSummary(res.reply);
                } catch (err) {
                  setAiSummary(`生成失败：${getErrorMessage(err)}`);
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
            : <p className="reader-hint">{summarizing ? '正在基于全文检索并生成…' : '点上方按钮生成结构化摘要（走全文检索，不只看当前页）。'}</p>}

          {/* 引文：Zotero 最核心而此前完全缺失的一环 —— 读完能直接引用。 */}
          <div className="rm-section-title">引文</div>
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
                  setCitationCopied('已复制');
                  window.setTimeout(() => setCitationCopied(''), 1600);
                }}
              >复制</button>
              <button
                type="button"
                className="btn"
                title="把整个文库导出为 .bib"
                onClick={async () => {
                  const bib = await exportBibtex();
                  await navigator.clipboard.writeText(bib);
                  setCitationCopied('全库 BibTeX 已复制');
                  window.setTimeout(() => setCitationCopied(''), 2200);
                }}
              >导出全库 .bib</button>
              {citationCopied && <span className="rm-citation-copied">{citationCopied}</span>}
            </div>
            <pre className="rm-citation-text">
              {citationQuery.data?.[citationStyle] ?? (citationQuery.isError ? '引文生成失败' : '生成中…')}
            </pre>
            {citationQuery.data && !paper.journal && !paper.doi && (
              <p className="reader-hint">
                ⚠ 这篇文献缺期刊 / DOI / 卷期，引文会不完整。补齐上方 Metadata 后引文会自动跟着变。
              </p>
            )}
          </div>

          <div className="rm-section-title">Abstract</div>
          <p className="rm-abstract">{paper.abstract || '—'}</p>
          <div className="rm-section-title">
            AI Metadata（KV）
            {!kvEditing && (
              <button type="button" className="icon-btn rm-edit-btn" title="编辑 KV 元数据" onClick={() => { setKvDraft(metadataQuery.data || []); setKvEditing(true); }}>
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
                    placeholder="字段名"
                    value={field.key}
                    onChange={(event) => {
                      const next = [...kvDraft];
                      next[index] = { ...next[index], key: event.target.value };
                      setKvDraft(next);
                    }}
                  />
                  <input
                    className="field-input rm-kv-edit-val"
                    placeholder="值"
                    value={field.value}
                    onChange={(event) => {
                      const next = [...kvDraft];
                      next[index] = { ...next[index], value: event.target.value };
                      setKvDraft(next);
                    }}
                  />
                  <button type="button" className="icon-btn" title="删除" onClick={() => setKvDraft(kvDraft.filter((_, i) => i !== index))}>
                    <Trash2 size={11} aria-hidden="true" />
                  </button>
                </div>
              ))}
              <div className="rm-kv-edit-actions">
                <button type="button" className="btn" onClick={() => setKvDraft([...kvDraft, { key: '', value: '' }])}>
                  <Plus size={11} aria-hidden="true" /> 添加字段
                </button>
                <button type="button" className="btn btn-primary" disabled={kvSaving} onClick={async () => {
                  setKvSaving(true);
                  try {
                    const result = await replacePaperMetadata(paper.id, kvDraft.filter((f) => f.key.trim()));
                    await queryClient.invalidateQueries({ queryKey: ['paperMetadata', paper.id] });
                    if (result.overwrittenKeys.length > 0) {
                      setMetadataMsg(`已保存，但检测到重复字段 ${result.overwrittenKeys.join('、')}，仅保留了最后一次填写的值。`);
                    } else {
                      setMetadataMsg('KV 元数据已保存');
                    }
                    setKvEditing(false);
                  } catch (err) {
                    setMetadataMsg(`保存失败：${getErrorMessage(err)}`);
                  } finally {
                    setKvSaving(false);
                  }
                }}>
                  <Save size={11} aria-hidden="true" /> {kvSaving ? '保存中…' : '保存'}
                </button>
                <button type="button" className="btn" onClick={() => setKvEditing(false)}>取消</button>
              </div>
            </div>
          ) : (metadataQuery.data || []).length === 0 ? (
            <div className="rm-kv-empty">
              <p className="reader-hint">暂无 KV 元数据</p>
              <button type="button" className="btn" onClick={() => { setKvDraft([{ key: '', value: '' }]); setKvEditing(true); }}>
                <Plus size={11} aria-hidden="true" /> 添加自定义字段
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
                <Plus size={11} aria-hidden="true" /> 添加字段
              </button>
            </>
          )}
        </div>
      )}

      {tab === 'related' && (
        <div className="reader-related">
          {(relatedQuery.data || []).length === 0 && (
            <p className="reader-hint">同 Collection / 同标签的相关文献会显示在这里。</p>
          )}
          {(relatedQuery.data || []).map((related) => (
            <button key={related.id} type="button" className="related-item" onClick={() => openReader(related)}>
              <span className="related-title">{related.title}</span>
              <span className="related-meta">
                {related.authors || '—'} · {related.year ?? '—'} · {related.journal || '—'}
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
            setNoteMsg('笔记已写入 Vault');
          }}
        />
      )}
    </div>
  );
}
