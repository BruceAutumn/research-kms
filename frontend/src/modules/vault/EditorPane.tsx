import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { diffLines } from 'diff';
import { Eye, FileText, PenLine, Pin, Sparkles, X } from 'lucide-react';
import { getErrorMessage, listTableRows, readNoteFile, saveNoteFile,
  asSaveConflict,
  uploadVaultAttachment,
  vaultFileUrl
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

/** 中间栏：Editor Tabs + CodeMirror + 自动保存 + 冲突检测 + 预览/附件预览。 */
export default function EditorPane() {
  const { tabs, activePath, openNote, closeTab, moveTab, togglePinTab, refreshTree, requestOpen, scrollRequest, propertiesTick, setActiveContent } = useVault();
  const [files, setFiles] = useState<Record<string, FileState>>({});
  const [previewMode, setPreviewMode] = useState<PreviewMode>('edit');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [conflict, setConflict] = useState<null | { path: string; mine: string; serverContent: string; serverMtime: number }>(null);
  const [showDiff, setShowDiff] = useState(false);
  /** 工具栏通过这个 ref 调用编辑命令；工具栏本身不碰 CodeMirror。 */
  const editorRef = useRef<MarkdownEditorHandle | null>(null);
  /**
   * Live Preview（Obsidian 式：光标所在行显示原始语法，其它行渲染）。
   * 持久化到 localStorage —— 这是个人偏好，不该每次开应用都重设。
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

  // Outline 跳转请求（来自 KnowledgePanel）→ 转给 CodeMirror
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

  // 打开/切换 Tab 时加载文件
  useEffect(() => {
    if (!activePath) return;
    if (filesRef.current[activePath]) return; // 已加载，保留未保存状态
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
      // 此前这里直接 `err as SaveConflictError`，但 axios 抛的是 AxiosError，
      // conflict 恒为 undefined —— Vault 的冲突对话框从来没弹出过。
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
   * 粘贴 / 拖拽进来的文件 -> 上传到 Vault 的 Attachments/ -> 返回要插入的 Markdown。
   * 多个文件各插一行；单个文件不换行，直接插在光标处。
   */
  const handleDropFiles = useCallback(async (files: File[]) => {
    const results: string[] = [];
    for (const file of files) {
      const uploaded = await uploadVaultAttachment(file);
      results.push(uploaded.embed);
    }
    return results.length === 1 ? results[0] : results.join('\n');
  }, []);

  /** 保存当前活动文件（Cmd+S 或自动保存计时器）。 */
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
    // 停止输入 800ms 后自动保存
    if (timersRef.current[path]) window.clearTimeout(timersRef.current[path]);
    timersRef.current[path] = window.setTimeout(() => {
      const state = filesRef.current[path];
      if (state && state.saveState === 'dirty') {
        void doSave(path, state.content, state.mtime);
      }
    }, 800);
  }

  // Properties 写回后：编辑器处于干净状态时重新读取文件
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
      void doSave(conflict.path, mine, undefined); // 不带 baseMtime = 覆盖
    } else if (choice === 'discard') {
      // 放弃本地修改：回滚到服务器内容
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
    if (state && state.saveState === 'dirty' && !window.confirm(`「${tab.title}」有未保存的修改，确定关闭？`)) return;
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
        { label: '关闭', onClick: () => requestCloseTab(tab) },
        {
          label: '关闭其他',
          onClick: () => {
            for (const item of others) closeTab(item.path);
          }
        },
        {
          label: '关闭右侧',
          onClick: () => {
            for (const item of tabs.slice(index + 1)) closeTab(item.path);
          }
        },
        { label: tab.pinned ? '取消 Pin' : 'Pin', onClick: () => togglePinTab(tab.path) }
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
              {dirty && <span className="vault-tab-dirty" title="有未保存修改" />}
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
            title={livePreviewOn ? 'Live Preview 已开启（点击回到纯源码）' : 'Live Preview 已关闭（点击开启所见即所得）'}
            onClick={() => {
              const next = !livePreviewOn;
              setLivePreviewOn(next);
              try { localStorage.setItem('kms.vault.livePreview', next ? 'on' : 'off'); } catch { /* 忽略配额错误 */ }
            }}
          >
            <Sparkles size={13} />
          </button>
          <span className="vault-preview-sep" />
          <button type="button" className={`icon-btn ${previewMode === 'edit' ? 'is-on' : ''}`} title="编辑模式" onClick={() => setPreviewMode('edit')}>
            <PenLine size={13} />
          </button>
          <button type="button" className={`icon-btn ${previewMode === 'preview' ? 'is-on' : ''}`} title="预览模式" onClick={() => setPreviewMode('preview')}>
            <Eye size={13} />
          </button>
        </div>
      </div>

      {!activePath || !active ? (
        <div className="vault-editor-empty">
          <FileText size={28} />
          <p>未打开笔记 —— 从 Files 选择或新建一篇笔记。</p>
        </div>
      ) : isAttachment ? (
        <div className="vault-attachment">
          <div className="vault-attachment-name">{activePath.split('/').pop()}</div>
          {isImage && (
            <img src={vaultFileUrl(activePath)} alt={activePath} className="vault-attachment-img" />
          )}
          {isPdf && (
            <iframe src={vaultFileUrl(activePath)} title={activePath} className="vault-attachment-pdf" />
          )}
          {!isImage && !isPdf && <p className="vault-attachment-hint">此文件类型不支持内嵌预览。</p>}
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
                    if (window.confirm(`笔记「${title}」不存在，要创建这篇笔记吗？`)) {
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

      {/* 保存状态指示 */}
      {active && !isAttachment && (
        <div className="vault-statusbar">
          <span className={`vault-save-state is-${active.saveState}`}>
            {active.saveState === 'saved' && '已保存'}
            {active.saveState === 'dirty' && '未保存…'}
            {active.saveState === 'saving' && '保存中…'}
            {active.saveState === 'error' && '保存失败（重试）'}
            {active.saveState === 'conflict' && '检测到外部修改冲突'}
          </span>
          {active.saveState === 'error' && (
            <button type="button" className="btn" onClick={saveActive}>重试</button>
          )}
          {!active.frontmatterValid && (
            <span className="vault-fm-warning">⚠ frontmatter 解析失败（黄色警告），请检查 YAML 语法。</span>
          )}
          <span className="vault-statusbar-right">{activeTitle} · {active.content.split('\n').length} 行 · 停止输入 800ms 自动保存 / ⌘S 立即保存</span>
        </div>
      )}

      {/* 冲突对话框：绝不静默覆盖 */}
      {conflict && (
        <div className="dialog-shell">
          <div className="dialog-overlay" onClick={() => setConflict(null)} />
          <div className="dialog vault-conflict-dialog">
            <div className="dialog-header">
              <span className="dialog-title">文件已被外部修改</span>
            </div>
            <div className="dialog-body">
              <p className="dialog-desc">
                磁盘版本已被外部（如 Obsidian）修改。请选择覆盖、放弃本地修改，或查看差异后再决定。
              </p>
              {showDiff && (
                <div className="vault-diff">
                  {conflictDiff.map((part, index) => (
                    <div
                      key={index}
                      className={`vault-diff-line ${part.added ? 'is-added' : part.removed ? 'is-removed' : ''}`}
                    >
                      {(part.added ? '+' : part.removed ? '−' : ' ')} {part.value}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn" onClick={() => setShowDiff((v) => !v)}>{showDiff ? '收起差异' : '查看差异'}</button>
              <button type="button" className="btn" onClick={() => resolveConflict('discard')}>放弃（用磁盘版本）</button>
              <button type="button" className="btn btn-primary" onClick={() => resolveConflict('overwrite')}>覆盖（用我的版本）</button>
            </div>
          </div>
        </div>
      )}

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
