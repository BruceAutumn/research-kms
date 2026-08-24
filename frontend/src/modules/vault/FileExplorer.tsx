import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bot,
  ChevronDown, ChevronRight, File, FileImage, FileText, FileType2, Folder, FolderOpen,
  FolderPlus, ListTree, Plus, RefreshCw, Search, Table2, Tags
} from 'lucide-react';
import {
  createVaultFolder, createVaultNote, deleteVaultFile, deleteVaultFolder,
  getVaultTree, listTableRows, moveVaultNote, renameVaultNote, rescanVault, searchVault
} from '../../api/client';
import { getErrorMessage } from '../../api/client';
import type { MenuItem } from '../literature/ContextMenu';
import ContextMenu from '../literature/ContextMenu';
import type { MenuState } from '../literature/ContextMenu';
import { useVault, consumeVaultAction, listenVaultAction } from './VaultContext';
import type { VaultAction } from './VaultContext';
import type { VaultTreeNode } from '../../types';
import { dispatchAiAction } from '../ai/AiStudioContext';

type SortMode = 'name' | 'mtime' | 'ctime';
type ViewMode = 'files' | 'tags';

interface FileExplorerProps {
  view: 'files' | 'table';
  onViewChange: (view: 'files' | 'table') => void;
}

const TYPE_ICONS: Record<string, typeof File> = {
  md: FileText,
  canvas: FileType2,
  pdf: FileText,
  image: FileImage,
  other: File
};

export default function FileExplorer({ view, onViewChange }: FileExplorerProps) {
  const { tabs, activePath, openNote, treeTick, refreshTree, clearPendingAction } = useVault();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['']));
  const [sortMode, setSortMode] = useState<SortMode>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('files');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedDir, setSelectedDir] = useState('');
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dialog, setDialog] = useState<null | { kind: 'note' | 'folder' | 'rename'; path: string; isFolder?: boolean; oldName?: string }>(null);
  const [dialogValue, setDialogValue] = useState('');
  /**
   * Target dir on create, Can differ from selected dir. 
   * Originally only creatable in selectedDir in -- OneonceSelectedsubFolder, then againAlsono entry at Vault Build in root dir, 
   * result allFolderall forced intoExistingsubFolderdown. 
   */
  const [dialogParent, setDialogParent] = useState('');
  const [updateRefs, setUpdateRefs] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [dragPath, setDragPath] = useState<string | null>(null);
  const menuTargetRef = useRef<{ path: string; isFolder: boolean; name: string } | null>(null);

  const treeQuery = useQuery({ queryKey: ['vault', 'tree', treeTick], queryFn: getVaultTree });
  const tableQuery = useQuery({ queryKey: ['vault', 'table'], queryFn: listTableRows });
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchVault>> | null>(null);
  const [searching, setSearching] = useState(false);

  // Tag Aggregate(frontmatter tags)
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const row of tableQuery.data ?? []) {
      const tags = row.properties?.tags;
      if (Array.isArray(tags)) {
        for (const tag of tags) {
          if (typeof tag === 'string') counts.set(tag, (counts.get(tag) ?? 0) + 1);
        }
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [tableQuery.data]);

  const tagsByNote = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const row of tableQuery.data ?? []) {
      const tags = row.properties?.tags;
      if (Array.isArray(tags)) {
        map.set(row.path, tags.filter((t): t is string => typeof t === 'string'));
      }
    }
    return map;
  }, [tableQuery.data]);

  const doSearch = useCallback(async (q: string) => {
    setSearching(true);
    try {
      setSearchResults(await searchVault(q));
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    if (query.trim().length === 0) {
      setSearchResults(null);
      return;
    }
    const timer = setTimeout(() => void doSearch(query), 250);
    return () => clearTimeout(timer);
  }, [query, searchOpen, doSearch]);

  // Action Bus: Command Palette -> openToshouldDialog
  useEffect(() => {
    const action = consumeVaultAction();
    if (action) applyAction(action);
    const stop = listenVaultAction(applyAction);
    return stop;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyAction(action: VaultAction) {
    if (action.type === 'new-note') setDialog({ kind: 'note', path: selectedDir });
    else if (action.type === 'new-folder') setDialog({ kind: 'folder', path: selectedDir });
    else if (action.type === 'focus-search') setSearchOpen(true);
    clearPendingAction?.();
  }

  function sortNodes(nodes: VaultTreeNode[]): VaultTreeNode[] {
    const sorted = [...nodes].sort((a, b) => {
      if (a.type === 'folder' && b.type !== 'folder') return -1;
      if (a.type !== 'folder' && b.type === 'folder') return 1;
      let cmp = 0;
      if (sortMode === 'mtime') cmp = (a.mtime ?? 0) - (b.mtime ?? 0);
      else if (sortMode === 'ctime') cmp = (a.ctime ?? 0) - (b.ctime ?? 0);
      else cmp = a.name.localeCompare(b.name, 'zh-CN');
      return sortAsc ? cmp : -cmp;
    });
    return sorted.map((node) => (node.children ? { ...node, children: sortNodes(node.children) } : node));
  }

  const tree = treeQuery.data;

  /** Flatten all folder paths, provide"Create Location"dropdown uses.  */
  const allFolders = useMemo(() => {
    const out: string[] = [];
    const walk = (nodes: VaultTreeNode[] | undefined) => {
      for (const node of nodes || []) {
        if (node.type === 'folder') {
          if (node.path) out.push(node.path);
          walk(node.children);
        }
      }
    };
    walk(tree ? [tree] : []);
    return out.sort();
  }, [tree]);

  // openNew Dialogwhen, Default to selected directory, But user can change(Including back to root). 
  useEffect(() => {
    if (dialog && dialog.kind !== 'rename') setDialogParent(dialog.path);
  }, [dialog]);

  function toggleExpand(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function collapseAll() {
    setExpanded(new Set(['']));
  }

  function openMenu(event: React.MouseEvent, target: { path: string; isFolder: boolean; name: string }) {
    event.preventDefault();
    event.stopPropagation();
    menuTargetRef.current = target;
    const dir = target.isFolder ? target.path : target.path.slice(0, target.path.lastIndexOf('/'));
    setMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        { label: 'New Note', icon: <FileText size={13} />, onClick: () => setDialog({ kind: 'note', path: dir }) },
        { label: 'New Folder', icon: <FolderPlus size={13} />, onClick: () => setDialog({ kind: 'folder', path: dir }) },
        { label: 'Rename', icon: <FileText size={13} />, onClick: () => setDialog({ kind: 'rename', path: target.path, isFolder: target.isFolder, oldName: target.name }) },
        { label: 'Delete', icon: <FileText size={13} />, danger: true, onClick: () => void removeNode(target) },
        {
          label: 'Run Agent',
          icon: <Bot size={13} />,
          onClick: () => dispatchAiAction({
            type: 'run-agent',
            source: target.isFolder ? 'vault-folder' : 'vault-file',
            label: target.name,
            instruction: target.isFolder
              ? `Please read Vault Folder"${target.name}"note in, Organize Topics, Gaps and next research plan. `
              : `Please read Vault Note"${target.name}", Refine Abstract, Key Concept, relatedPaperclueandCanimproved metadata. `,
            contextRefs: [{ type: target.isFolder ? 'vault-folder' : 'vault-file', path: target.path, label: target.name }]
          })
        }
      ]
    });
  }

  async function removeNode(target: { path: string; isFolder: boolean; name: string }) {
    const confirmText = target.isFolder
      ? `Confirm delete folder"${target.name}"andItsAllcontent? this action notCanResume. `
      : `Confirm Delete"${target.name}"? `;
    if (!window.confirm(confirmText)) return;
    setBusy(true);
    try {
      if (target.isFolder) await deleteVaultFolder(target.path);
      else await deleteVaultFile(target.path);
      if (target.isFolder) {
        setExpanded((prev) => {
          const next = new Set([...prev].filter((p) => !p.startsWith(target.path)));
          return next;
        });
      }
      refreshTree();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function submitDialog() {
    const d = dialog;
    if (!d || !dialogValue.trim()) return;
    setBusy(true);
    try {
      if (d.kind === 'note') {
        const result = await createVaultNote(dialogParent, dialogValue.trim());
        refreshTree();
        openNote(result.path, result.title);
      } else if (d.kind === 'folder') {
        await createVaultFolder(dialogParent, dialogValue.trim());
        setExpanded((prev) => new Set([...prev, dialogParent]));
        refreshTree();
      } else if (d.kind === 'rename') {
        const name = d.isFolder ? dialogValue.trim() : dialogValue.trim().replace(/\.md$/i, '');
        const result = await renameVaultNote(d.path, name, !d.isFolder && updateRefs);
        if (result.updatedReferences.length > 0) {
          window.alert(`SyncedUpdate ${result.updatedReferences.length} references: \n${result.updatedReferences.join('\n')}`);
        }
        refreshTree();
      }
      setDialog(null);
      setDialogValue('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleDrop(targetDir: string) {
    setDropTarget(null);
    if (!dragPath) return;
    if (targetDir === dragPath || targetDir === dragPath.slice(0, dragPath.lastIndexOf('/'))) {
      setDragPath(null);
      return;
    }
    try {
      await moveVaultNote(dragPath, targetDir);
      refreshTree();
    } catch (err) {
      setError(getErrorMessage(err));
    }
    setDragPath(null);
  }

  function matchesTagFilter(path: string): boolean {
    if (!selectedTag) return true;
    return (tagsByNote.get(path) ?? []).includes(selectedTag);
  }

  function renderTreeNode(node: VaultTreeNode, depth: number): React.ReactNode {
    if (node.type !== 'folder' && !matchesTagFilter(node.path)) return null;
    const isFolder = node.type === 'folder';
    const isExpanded = expanded.has(node.path);
    const isActive = activePath === node.path;
    const isOpen = tabs.some((tab) => tab.path === node.path);
    const Icon = isFolder ? (isExpanded ? FolderOpen : Folder) : (TYPE_ICONS[node.type] ?? File);
    return (
      <div key={node.path || '__root__'}>
        <div
          className={`tree-row ${isActive ? 'is-active' : ''} ${dropTarget === node.path && isFolder ? 'is-drop-target' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          draggable={!isFolder}
          onClick={() => {
            if (isFolder) {
              setSelectedDir(node.path);
              toggleExpand(node.path);
            } else openNote(node.path, node.name.replace(/\.md$/i, ''));
          }}
          onContextMenu={(event) => openMenu(event, { path: node.path, isFolder, name: node.name })}
          onDragStart={() => !isFolder && setDragPath(node.path)}
          onDragEnd={() => setDragPath(null)}
          onDragOver={(event) => {
            if (isFolder && dragPath) {
              event.preventDefault();
              setDropTarget(node.path);
            }
          }}
          onDragLeave={() => setDropTarget((prev) => (prev === node.path ? null : prev))}
          onDrop={(event) => {
            if (isFolder) {
              event.preventDefault();
              void handleDrop(node.path);
            }
          }}
        >
          <span className="tree-row-caret">
            {isFolder && (isExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />)}
          </span>
          <span className="tree-row-icon"><Icon size={13} /></span>
          <span className="tree-row-label">{node.name}</span>
          {isOpen && !isActive && <span className="tree-row-count">*</span>}
        </div>
        {isFolder && isExpanded && (
          <div>{(sortNodes(node.children ?? [])).map((child) => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  }

  return (
    <div className="vault-files">
      <div className="lit-toolbar vault-toolbar">
        <div className="lit-toolbar-group">
          <button
            type="button"
            className={`vault-view-switch ${view === 'files' ? 'is-active' : ''}`}
            onClick={() => onViewChange('files')}
          >
            <ListTree size={12} /> File
          </button>
          <button
            type="button"
            className={`vault-view-switch ${view === 'table' ? 'is-active' : ''}`}
            onClick={() => onViewChange('table')}
          >
            <Table2 size={12} /> Table
          </button>
        </div>
        <div className="lit-toolbar-group">
          <button type="button" className="icon-btn" title="New Note" onClick={() => setDialog({ kind: 'note', path: selectedDir })}>
            <Plus size={14} />
          </button>
          <button type="button" className="icon-btn" title="New Folder" onClick={() => setDialog({ kind: 'folder', path: selectedDir })}>
            <FolderPlus size={14} />
          </button>
          <button type="button" className={`icon-btn ${searchOpen ? 'is-on' : ''}`} title="search" onClick={() => setSearchOpen((v) => !v)}>
            <Search size={14} />
          </button>
          <button type="button" className="icon-btn" title={`Sort: ${sortMode}${sortAsc ? ' ^' : ' v'}(Click Switch)`}
            onClick={() => {
              if (sortMode === 'name') setSortMode('mtime');
              else if (sortMode === 'mtime') setSortMode('ctime');
              else { setSortMode('name'); setSortAsc((v) => !v); }
            }}>
            <span className="vault-sort-icon"><-></span>
          </button>
          <button type="button" className="icon-btn" title="Collapse All" onClick={collapseAll}>
            <span className="vault-sort-icon">[-]</span>
          </button>
          <button type="button" className="icon-btn" title="Rescan external changes" onClick={() => void rescanVault().then(() => refreshTree())}>
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {view === 'files' && searchOpen && (
        <div className="lit-toolbar-search vault-search">
          <Search size={12} />
          <input
            placeholder="Search File Name + Full Text..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}

      {view === 'files' && (
        <div className="vault-view-chips">
          <button type="button" className={`vault-chip ${viewMode === 'files' ? 'is-active' : ''}`} onClick={() => setViewMode('files')}>
            <ListTree size={11} /> File
          </button>
          <button type="button" className={`vault-chip ${viewMode === 'tags' ? 'is-active' : ''}`} onClick={() => setViewMode('tags')}>
            <Tags size={11} /> Tag {tagCounts.length > 0 && `(${tagCounts.length})`}
          </button>
        </div>
      )}

      {error && <div className="vault-error">{error}</div>}

      {view === 'files' && searchOpen && query.trim() ? (
        <div className="vault-search-results">
          {searching && <div className="tree-empty">Searching...</div>}
          {(searchResults ?? []).map((row) => (
            <button key={row.path} type="button" className="vault-search-row" onClick={() => { openNote(row.path, row.title); setSearchOpen(false); setQuery(''); }}>
              <span className="vault-search-title">{row.title}</span>
              <span className="vault-search-snippet">{row.snippet}</span>
            </button>
          ))}
          {!searching && searchResults && searchResults.length === 0 && <div className="tree-empty">No Match. </div>}
        </div>
      ) : viewMode === 'tags' ? (
        <div className="vault-tags">
          <button type="button" className={`vault-tag ${selectedTag === null ? 'is-active' : ''}`} onClick={() => setSelectedTag(null)}>All</button>
          {tagCounts.map(([tag, count]) => (
            <button key={tag} type="button" className={`vault-tag ${selectedTag === tag ? 'is-active' : ''}`} onClick={() => setSelectedTag(tag)}>
              #{tag} <span className="vault-tag-count">{count}</span>
            </button>
          ))}
          {selectedTag && (
            <p className="vault-tag-filter-hint">Filtered: #{selectedTag}(belowFile TreeinHighlightToshouldNote)</p>
          )}
        </div>
      ) : null}

      {view === 'files' && (!searchOpen || !query.trim()) && viewMode === 'files' && (
        <div className="tree">
          {tree ? (sortNodes([tree])).map((node) => renderTreeNode(node, 0)) : (
            <div className="tree-empty">{treeQuery.isError ? getErrorMessage(treeQuery.error) : 'Loading...'}</div>
          )}
        </div>
      )}

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />

      {dialog && (
        <div className="dialog-shell">
          <div className="dialog-overlay" onClick={() => setDialog(null)} />
          <div className="dialog" style={{ width: 420 }}>
            <div className="dialog-header">
              <span className="dialog-title">
                {dialog.kind === 'note' ? 'New Note' : dialog.kind === 'folder' ? 'New Folder' : 'Rename'}
              </span>
            </div>
            <div className="dialog-body">
              <div className="field">
                <label className="field-label">
                  {dialog.kind === 'folder' ? 'Folder Name' : dialog.kind === 'rename' && dialog.isFolder ? 'New Folder Name' : 'Note Title'}
                </label>
                <input
                  className="field-input"
                  autoFocus
                  value={dialogValue}
                  placeholder={dialog.oldName ?? (dialog.kind === 'note' ? 'E.g.: Cs Adsorption Material' : 'New Folder')}
                  onChange={(event) => setDialogValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitDialog();
                  }}
                />
              </div>
              {dialog.kind === 'rename' && !dialog.isFolder && (
                <label className="vault-checkbox">
                  <input type="checkbox" checked={updateRefs} onChange={(event) => setUpdateRefs(event.target.checked)} />
                  Sync update references [[{dialog.oldName?.replace(/\.md$/i, '')}]]  Note(Obsidian Behavior)
                </label>
              )}
              {dialog.kind !== 'rename' && (
                <div className="field">
                  <label className="field-label">Create Location</label>
                  <div className="vault-dest-row">
                    <select
                      className="field-input"
                      value={dialogParent}
                      onChange={(event) => setDialogParent(event.target.value)}
                    >
                      <option value="">Vault Root Dir</option>
                      {allFolders.map((folder) => (
                        <option key={folder} value={folder}>{folder}</option>
                      ))}
                    </select>
                    {dialogParent !== '' && (
                      <button type="button" className="btn" onClick={() => setDialogParent('')}>Back to root</button>
                    )}
                  </div>
                  <p className="dialog-desc">
                    will at"{dialogParent || 'Vault Root Dir'}"Create
                    {dialog.kind === 'note' ? ' .md File' : 'Folder'}. 
                  </p>
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button type="button" className="btn" onClick={() => setDialog(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={busy || !dialogValue.trim()} onClick={() => void submitDialog()}>
                {busy ? 'Processing...' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
