import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { Eye, FileText, PenLine, Pin, Sparkles, X } from 'lucide-react';
import { getErrorMessage, listTableRows, readNoteFile, saveNoteFile,
  asSaveConflict,
  uploadVaultAttachment
} from '../../api/client';
import { useVault } from './VaultContext';
import MarkdownEditor from './MarkdownEditor';
import type { MarkdownEditorHandle } from './MarkdownEditor';
import EditorToolbar from './EditorToolbar';
import MarkdownPreview from '../../components/MarkdownPreview';
import ContextMenu from '../literature/ContextMenu';
import type { MenuState } from '../literature/ContextMenu';
import type { VaultTab } from '../../types';

type SaveState = 'saved' | 'dirty' | 'saving' | 'error' | 'conflict';

interface FileState {
  path: string;
  content: string;
  mtime: number;
  saveState: SaveState;
  frontmatterValid: boolean;
}

type PreviewMode = 'edit' | 'preview';

/** Middle Column: Editor Tabs + CodeMirror + Autosave + Conflict Detection + Preview/Attachment Preview.  */
export default function EditorPane() {
  const { tabs, activePath, openNote, closeTab, moveTab, togglePinTab, refreshTree, requestOpen, scrollRequest, propertiesTick, setActiveContent } = useVault();
  const [files, setFiles] = useState<Record<string, FileState>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [conflict, setConflict] = useState<null | { path: string; mine: string; serverContent: string; serverMtime: number }>(null);
  const [showDiff, setShowDiff] = useState(false);
  /** Toolbar via this ref Call edit command; Toolbar itself untouched CodeMirror.  */
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  /**
   * Live Preview(Obsidian style: Show raw syntax at cursor line, Other lines render). 
   * persist to localStorage -- this is personal preference, should not reset on every open. 
   */
  const [livePreviewOn, setLivePreviewOn] = useState(() => {
    try {
      return localStorage.getItem('kms.vault.livePreview') !== 'off';
    } catch {
      return true;
    }
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const timersRef = useRef<Record<string, number>>({});
  const filesRef = useRef(files);
  filesRef.current = files;
  const conflictPathRef = useRef<string | null>(null);
  const [scrollTarget, setScrollTarget] = useState<{ seq: number; line: number } | null>(null);

  // Outline Jump Request(from KnowledgePanel)-> forward to CodeMirror
  useEffect(() => {
    if (scrollRequest && scrollRequest.path === activePath) {
      setScrollTarget({ seq: scrollRequest.seq, line: scrollRequest.line });
    }
  }, [scrollRequest, activePath]);

  const tableQuery = useQuery({ queryKey: ['vault', 'table'], queryFn: listTableRows });

  const titles = useMemo(
    () => (tableQuery.data ?? []).map((row) => ({ title: row.title, path: row.path })),
    [tableQuery.data]
  );
  const tagSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const row of tableQuery.data ?? []) {
      const tags = row.properties?.tags;
      if (Array.isArray(tags)) for (const tag of tags) if (typeof tag === 'string') set.add(tag);
    }
    return [...set];
  }, [tableQuery.data]);

  const existingTitleSet = useMemo(() => new Set(titles.map((item) => item.title)), [titles]);

  // open/CutChange Tab whenLoadFile
  useEffect(() => {
    if (!activePath) return;
    if (filesRef.current[activePath]) return; // Loaded, Keep unsaved state
    void readNoteFile(activePath)
      .then((file) => {
        setFiles((prev) => ({
          ...prev,
          [activePath]: {
            path: activePath,
            content: file.content,
            mtime: file.mtime,
            saveState: 'saved',
            frontmatterValid: file.frontmatterValid
          }
        }));
      })
      .catch(() => {
        setFiles((prev) => ({
          ...prev,
          [activePath]: { path: activePath, content: '', mtime: 0, saveState: 'error', frontmatterValid: true }
        }));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath]);

  const doSave = useCallback(async (path: string, content: string, baseMtime?: number) => {
    setFiles((prev) => ({ ...prev, [path]: { ...prev[path], saveState: 'saving' } }));
    try {
      const result = await saveNoteFile(path, content, baseMtime);
      setFiles((prev) => ({
        ...prev,
        [path]: { ...prev[path], content, mtime: result.mtime, saveState: 'saved' }
      }));
    } catch (err) {
      // before thisindirectly `err as SaveConflictError`, But axios Throws AxiosError, 
      // conflict always undefined -- Vault Conflict dialog never popped. 
      const conflictInfo = asSaveConflict(err);
      if (conflictInfo) {
        conflictPathRef.current = path;
        setConflict({
          path,
          mine: content,
          serverContent: conflictInfo.serverContent ?? '',
          serverMtime: conflictInfo.serverMtime ?? Date.now()
        });
        setShowDiff(false);
        setFiles((prev) => ({ ...prev, [path]: { ...prev[path], saveState: 'conflict' } }));
      } else {
        setFiles((prev) => ({ ...prev, [path]: { ...prev[path], saveState: 'error' } }));
      }
    }
  }, []);

  /**
   * Paste / Dragged-in file -> Upload to Vault   Attachments/ -> Return to insert Markdown. 
   * multipleFileEachinsertOneLine; singleFilenotChangeLine, Insert directly at cursor. 
   */
  const handleDropFiles = useCallback(async (files: File[]) => {
    const results: string[] = [];
    for (const file of files) {
      const uploaded = await uploadVaultAttachment(file);
      results.push(uploaded.embed);
    }
    return results.length === 1 ? results[0] : results.join('\n');
  }, []);

  /** Save current active file(Cmd+S Or autosave timer).  */
  const saveActive = useCallback(() => {
    const path = activePath;
    if (!path) return;
    const state = filesRef.current[path];
    if (!state) return;
    void doSave(path, state.content, state.mtime);
  }, [activePath, doSave]);

  function handleDocChange(path: string, content: string) {
    setFiles((prev) => ({ ...prev, [path]: { ...prev[path], content, saveState: 'dirty' } }));
    if (path === activePath) setActiveContent(content);
    // Stop Input 800ms afterAutosave
    if (timersRef.current[path]) window.clearTimeout(timersRef.current[path]);
    timersRef.current[path] = window.setTimeout(() => {
      const state = filesRef.current[path];
      if (state && state.saveState === 'dirty') {
        void doSave(path, state.content, state.mtime);
      }
    }, 800);
  }

  // Properties After write back: Re-read file when editor clean
  useEffect(() => {
    if (!activePath || propertiesTick === 0) return;
    const state = filesRef.current[activePath];
    if (state && state.saveState === 'saved') {
      void readNoteFile(activePath).then((file) => {
        setFiles((prev) => ({
          ...prev,
          [activePath]: { path: activePath, content: file.content, mtime: file.mtime, saveState: 'saved', frontmatterValid: file.frontmatterValid }
        }));
        setActiveContent(file.content);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propertiesTick]);

  function resolveConflict(choice: 'overwrite' | 'discard' | 'edit') {
    if (!conflict) return;
    if (choice === 'overwrite') {
      const mine = conflict.mine;
      setConflict(null);
      void doSave(conflict.path, mine, undefined); // Without baseMtime = overwrite
    } else if (choice === 'discard') {
      // discard localModify: Roll back to server content
      setFiles((prev) => ({
        ...prev,
        [conflict.path]: { ...prev[conflict.path], content: conflict.serverContent, mtime: conflict.serverMtime, saveState: 'saved' }
      }));
      setConflict(null);
    } else {
      setShowDiff((v) => !v);
    }
  }

  function requestCloseTab(tab: VaultTab) {
    const state = filesRef.current[tab.path];
    if (state && state.saveState === 'dirty' && !window.confirm(`"${tab.title}"hasUnsaved Modify, Confirm Close? `)) return;
    closeTab(tab.path);
  }

  function openTabMenu(event: React.MouseEvent, tab: VaultTab, index: number) {
    event.preventDefault();
    event.stopPropagation();
    const others = tabs.filter((item) => item.path !== tab.path);
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'close', onClick: () => requestCloseTab(tab) },
        {
          label: 'closeOther',
          onClick: () => {
            for (const item of others) closeTab(item.path);
          }
        },
        {
          label: 'closeRight',
          onClick: () => {
            for (const item of tabs.slice(index + 1)) closeTab(item.path);
          }
        },
        { label: tab.pinned ? 'Cancel Pin' : 'Pin', onClick: () => togglePinTab(tab.path) }
      ]
    });
  }

  function handleDropOnTab(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) return;
    moveTab(dragIndex, targetIndex);
    setDragIndex(null);
  }

  const active = activePath ? files[activePath] : null;
  const activeTab = tabs.find((tab) => tab.path === activePath);
  const activeTitle = activeTab?.title ?? (activePath ? activePath.split('/').pop()?.replace(/\.md$/i, '') ?? '' : '');
  const isAttachment = Boolean(activePath && !activePath.toLowerCase().endsWith('.md'));
  const isImage = Boolean(activePath && /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(activePath));
  const isPdf = Boolean(activePath && /\.pdf$/i.test(activePath));

  const conflictDiff = useMemo(() => {
    if (!conflict) return [];
    return diffLines(conflict.serverContent, conflict.mine);
  }, [conflict]);

  return (
    <div className="vault-editor">
      <div className="lit-tabbar vault-tabbar">
        {tabs.map((tab, index) => {
          const state = files[tab.path];
          const dirty = state?.saveState === 'dirty' || state?.saveState === 'conflict';
          return (
            <div
              key={tab.path}
              className={`lit-tab lit-tab-reader ${activePath === tab.path ? 'is-active' : ''}`}
              draggable
              onClick={() => openNote(tab.path, tab.title)}
              onAuxClick={(event) => {
                if (event.button === 1) requestCloseTab(tab);
              }}
              onContextMenu={(event) => openTabMenu(event, tab, index)}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => handleDropOnTab(index)}
            >
              {tab.pinned && <Pin size={10} className="lit-tab-pin" aria-hidden="true" />}
              <span className="lit-tab-label">{tab.title}</span>
              {dirty && <span className="vault-tab-dirty" title="hasUnsavedModify" />}
              <button
                type="button"
                className="lit-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  requestCloseTab(tab);
                }}
              >
                <X size={12} />
              </button>
            </div>
          );
        })}
        <div className="lit-tabbar-spacer" />
        <div className="vault-preview-switch">
          <button
            type="button"
            className={`icon-btn ${livePreviewOn ? 'is-on' : ''}`}
            title={livePreviewOn ? 'Live Preview Enabled(Click back to source)' : 'Live Preview Closed(Click to enable WYSIWYG)'}
            onClick={() => {
              const next = !livePreviewOn;
              setLivePreviewOn(next);
              try { localStorage.setItem('kms.vault.livePreview', next ? 'on' : 'off'); } catch { /* ignore quotaError */ }
            }}
          >
            <Sparkles size={13} />
          </button>
          <span className="vault-preview-sep" />
          <button type="button" className={`icon-btn ${previewMode === 'edit' ? 'is-on' : ''}`} title="Edit Mode" onClick={() => setPreviewMode('edit')}>
            <PenLine size={13} />
          </button>
          <button type="button" className={`icon-btn ${previewMode === 'preview' ? 'is-on' : ''}`} title="Preview Mode" onClick={() => setPreviewMode('preview')}>
            <Eye size={13} />
          </button>
        </div>
      </div>

      {!activePath || !active ? (
        <div className="vault-editor-empty">
          <FileText size={28} />
          <p>not openNote -- from Files Select or create a note. </p>
        </div>
      ) : isAttachment ? (
        <div className="vault-attachment">
          <div className="vault-attachment-name">{activePath.split('/').pop()}</div>
          {isImage && (
            <img src={`/api/vault/file?path=${encodeURIComponent(activePath)}`} alt={activePath} className="vault-attachment-img" />
          )}
          {isPdf && (
            <iframe src={`/api/vault/file?path=${encodeURIComponent(activePath)}`} title={activePath} className="vault-attachment-pdf" />
          )}
          {!isImage && !isPdf && <p className="vault-attachment-hint">thisFiletype no inline previewPreview. </p>}
        </div>
      ) : (
        <div className="vault-editor-body">
          {previewMode !== 'preview' && (
            <div className="vault-editor-src">
              <EditorToolbar editor={editorRef} onPickFiles={handleDropFiles} />
              <MarkdownEditor
                ref={editorRef}
                key={activePath}
                value={active.content}
                titles={titles}
                tags={tagSuggestions}
                onChange={(content) => handleDocChange(activePath, content)}
                onSave={saveActive}
                scrollRequest={scrollTarget}
                onDropFiles={handleDropFiles}
                livePreviewOn={livePreviewOn}
              />
            </div>
          )}
          {previewMode !== 'edit' && (
            <div className="vault-editor-preview">
              <MarkdownPreview
                content={active.content}
                existingTitles={existingTitleSet}
                onWikiLinkClick={(title) => requestOpen(title)}
                onWikiLinkMissing={(title) => {
                  const parent = activePath.includes('/') ? activePath.slice(0, activePath.lastIndexOf('/')) : '';
                  void import('../../api/client').then(async ({ createVaultNote }) => {
                    if (window.confirm(`Note"${title}"not exist, wantCreatethisNote?? `)) {
                      const result = await createVaultNote(parent, title, `# ${title}\n`);
                      refreshTree();
                      openNote(result.path, result.title);
                    }
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Save status indicator */}
      {active && !isAttachment && (
        <div className="vault-statusbar">
          <span className={`vault-save-state is-${active.saveState}`}>
            {active.saveState === 'saved' && 'Saved'}
            {active.saveState === 'dirty' && 'Unsaved...'}
            {active.saveState === 'saving' && 'Saving...'}
            {active.saveState === 'error' && 'Save failed(Retry)'}
            {active.saveState === 'conflict' && 'Detected external change conflict'}
          </span>
          {active.saveState === 'error' && (
            <button type="button" className="btn" onClick={saveActive}>Retry</button>
          )}
          {!active.frontmatterValid && (
            <span className="vault-fm-warning">! frontmatter parseFailed(Yellow Warning), Please check YAML Syntax. </span>
          )}
          <span className="vault-statusbar-right">{activeTitle} . {active.content.split('\n').length} Line . Stop Input 800ms Autosave / CmdS Save Now</span>
        </div>
      )}

      {/* Conflict Dialog: Never silently overwrite */}
      {conflict && (
        <div className="dialog-shell">
          <div className="dialog-overlay" onClick={() => setConflict(null)} />
          <div className="dialog vault-conflict-dialog">
            <div className="dialog-header">
              <span className="dialog-title">File modified externally</span>
            </div>
            <div className="dialog-body">
              <p className="dialog-desc">
                Disk version externally(Like Obsidian)Modify. Please choose overwrite, discard localModify, Or view diff then decide. 
              </p>
              {showDiff && (
                <div className="vault-diff">
                  {conflictDiff.map((part, index) => (
                    <div
                      key={index}
                      className={`vault-diff-line ${part.added ? 'is-added' : part.removed ? 'is-removed' : ''}`}
                    >
                      {(part.added ? '+' : part.removed ? '-' : ' ')} {part.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn" onClick={() => setShowDiff((v) => !v)}>{showDiff ? 'Collapse Diff' : 'View Diff'}</button>
              <button type="button" className="btn" onClick={() => resolveConflict('discard')}>discard(useDiskversion)</button>
              <button type="button" className="btn btn-primary" onClick={() => resolveConflict('overwrite')}>overwrite(use my version)</button>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
