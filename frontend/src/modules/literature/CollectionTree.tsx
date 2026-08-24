import { useMemo, useState } from 'react';
import type { DragEvent } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderPlus,
  Layers,
  Library,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Tag,
  Trash2,
  Bot,
  Clock,
  FileQuestion,
  BookOpenCheck
} from 'lucide-react';
import type { Collection, Paper } from '../../types';
import { deleteCollection, reorderCollections, updateCollection, addPapersToCollection } from '../../api/client';
import ContextMenu from './ContextMenu';
import type { MenuItem, MenuState } from './ContextMenu';
import { dispatchAiAction } from '../ai/AiStudioContext';

export type FilterState =
  | { kind: 'filter'; value: string }
  | { kind: 'tag'; value: string }
  | { kind: 'collection'; id: number; name: string };

export const PAPER_DRAG_TYPE = 'application/x-kms-paper-ids';
export const COLLECTION_DRAG_TYPE = 'application/x-kms-collection-id';

interface CollectionTreeProps {
  collections: Collection[];
  allPapers: Paper[];
  filterState: FilterState;
  onFilterChange: (filter: FilterState) => void;
  onMutated: () => void;
  onNewCollection: (parentId?: number) => void;
}

interface TreeNode {
  collection: Collection;
  children: TreeNode[];
  depth: number;
}

export default function CollectionTree({
  collections,
  allPapers,
  filterState,
  onFilterChange,
  onMutated,
  onNewCollection
}: CollectionTreeProps) {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [dropTarget, setDropTarget] = useState<{ id: number; zone: 'top' | 'bottom' } | null>(null);

  const counts = useMemo(() => {
    const c = {
      all: allPapers.length,
      recent: allPapers.length,
      recently_read: allPapers.filter((p) => p.lastOpenedAt).length,
      favorites: allPapers.filter((p) => p.favorite).length,
      unread: allPapers.filter((p) => !p.lastOpenedAt).length,
      ai_processed: allPapers.filter((p) => p.aiStatus === 'COMPLETED').length,
      ai_pending: allPapers.filter((p) => p.aiStatus !== 'COMPLETED').length,
      trash: allPapers.filter((p) => p.trashed).length
    };
    return c;
  }, [allPapers]);

  const tagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const paper of allPapers) {
      for (const tag of paper.tags || []) {
        map.set(tag, (map.get(tag) || 0) + 1);
      }
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [allPapers]);

  const tree = useMemo<TreeNode[]>(() => {
    const byParent = new Map<number | null, Collection[]>();
    for (const collection of collections) {
      const key = collection.parentId ?? null;
      const list = byParent.get(key) || [];
      list.push(collection);
      byParent.set(key, list);
    }
    for (const list of byParent.values()) {
      list.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
    }
    const build = (parentId: number | null, depth: number): TreeNode[] =>
      (byParent.get(parentId) || []).map((collection) => ({
        collection,
        depth,
        children: build(collection.id, depth + 1)
      }));
    return build(null, 0);
  }, [collections]);

  const toggleExpand = (id: number) => {
    setExpanded((old) => {
      const next = new Set(old);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  function startRename(id: number, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  async function commitRename() {
    if (renamingId === null) return;
    const name = renameDraft.trim();
    if (name) {
      await updateCollection(renamingId, { name });
      onMutated();
    }
    setRenamingId(null);
  }

  function collectionMenu(id: number): MenuItem[] {
    return [
      {
        label: 'New Sub Collection',
        icon: <FolderPlus size={13} />,
        onClick: () => onNewCollection(id)
      },
      {
        label: 'Rename',
        icon: <Pencil size={13} />,
        onClick: () => startRename(id, collections.find((c) => c.id === id)?.name || '')
      },
      {
        label: 'Run Agent',
        icon: <Bot size={13} />,
        onClick: () => {
          const collection = collections.find((c) => c.id === id);
          dispatchAiAction({
            type: 'run-agent',
            source: 'collection',
            label: collection?.name || `Collection #${id}`,
            instruction: `Please analyze Collection"${collection?.name || id}"paper in, Output topic clusters, Key papers and reading/Note Plan. `,
            contextRefs: [{ type: 'collection', id, label: collection?.name || `Collection #${id}`, count: collection?.paperCount }]
          });
        }
      },
      {
        label: 'Delete',
        icon: <Trash2 size={13} />,
        danger: true,
        onClick: async () => {
          if (window.confirm('Delete the Collection? Papers inside will not be deleted. ')) {
            await deleteCollection(id);
            onMutated();
          }
        }
      }
    ];
  }

  // ---- Drop: Paper -> Collection(multiTomulti, notCopyphysicalData) ----
  async function handlePaperDrop(event: DragEvent, collectionId: number) {
    event.preventDefault();
    setDropTarget(null);
    const raw = event.dataTransfer.getData(PAPER_DRAG_TYPE);
    if (!raw) return;
    try {
      const ids = JSON.parse(raw) as number[];
      await addPapersToCollection(collectionId, ids);
      onMutated();
    } catch {
      // ignore malformed payload
    }
  }

  // ---- Drop: Collection Sort / Change Parent ----
  async function handleCollectionDrop(movedId: number, targetId: number, zone: 'top' | 'bottom') {
    setDropTarget(null);
    const moved = collections.find((c) => c.id === movedId);
    const target = collections.find((c) => c.id === targetId);
    if (!moved || !target || moved.id === target.id) return;
    // cannot drag into own descendantin
    let cursor: Collection | undefined = target;
    while (cursor) {
      if (cursor.parentId === moved.id) return;
      cursor = collections.find((c) => c.id === cursor?.parentId);
    }
    const items = new Map<number, { id: number; parentId: number | null; sortOrder: number }>();
    const touch = (
      parentId: number | null,
      extra?: { id: number; parentId: number | null; sortOrder: number },
      indexOf?: { id: number; at: number }
    ) => {
      const siblings = collections
        .filter((c) => c.parentId === parentId && c.id !== movedId)
        .sort((a, b) => a.sortOrder - b.sortOrder);
      const list = siblings.map((c) => ({ id: c.id, parentId: c.parentId ?? null, sortOrder: c.sortOrder }));
      if (extra) {
        let at = list.length;
        if (indexOf) {
          const pos = list.findIndex((c) => c.id === indexOf.id);
          at = pos < 0 ? list.length : pos + indexOf.at;
        }
        list.splice(Math.max(0, Math.min(at, list.length)), 0, extra);
      }
      list.forEach((item, index) => items.set(item.id, { id: item.id, parentId: item.parentId, sortOrder: index }));
    };

    const sameParent = moved.parentId === target.parentId;
    if (sameParent) {
      touch(moved.parentId, { id: moved.id, parentId: moved.parentId, sortOrder: 0 }, { id: target.id, at: zone === 'top' ? 0 : 1 });
    } else if (zone === 'top') {
      touch(target.parentId, { id: moved.id, parentId: target.parentId, sortOrder: 0 }, { id: target.id, at: 0 });
      touch(moved.parentId);
    } else {
      // Drag into target as last child
      touch(target.id, { id: moved.id, parentId: target.id, sortOrder: 0 });
      touch(moved.parentId);
      setExpanded((old) => new Set(old).add(target.id));
    }
    await reorderCollections(Array.from(items.values()));
    onMutated();
  }

  const fixedGroups: Array<{ key: string; label: string; icon: React.ReactNode; count?: number }> = [
    { key: 'all', label: 'All Papers', icon: <Library size={13} />, count: counts.all },
    { key: 'recent', label: 'Recently Added', icon: <Clock size={13} />, count: counts.recent },
    { key: 'recently_read', label: 'Recently Read', icon: <BookOpenCheck size={13} />, count: counts.recently_read },
    { key: 'favorites', label: 'Favorite', icon: <Star size={13} />, count: counts.favorites },
    { key: 'unread', label: 'Unread', icon: <FileQuestion size={13} />, count: counts.unread },
    { key: 'ai_processed', label: 'AI Parsed', icon: <Check size={13} />, count: counts.ai_processed },
    { key: 'ai_pending', label: 'AI Pending Parse', icon: <Sparkles size={13} />, count: counts.ai_pending }
  ];

  const isFilterActive = (key: string) => filterState.kind === 'filter' && filterState.value === key;

  const renderNode = (node: TreeNode): React.ReactNode => {
    const { collection } = node;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(collection.id);
    const isSelected = filterState.kind === 'collection' && filterState.id === collection.id;
    return (
      <div key={collection.id}>
        <div
          className={`tree-row ${isSelected ? 'is-active' : ''} ${dropTarget?.id === collection.id ? 'is-drop-target' : ''}`}
          style={{ paddingLeft: 8 + node.depth * 14 }}
          draggable={renamingId !== collection.id}
          onClick={() => onFilterChange({ kind: 'collection', id: collection.id, name: collection.name })}
          onContextMenu={(event) => {
            event.preventDefault();
            setMenu({ x: event.clientX, y: event.clientY, items: collectionMenu(collection.id) });
          }}
          onDragStart={(event) => {
            event.dataTransfer.setData(COLLECTION_DRAG_TYPE, String(collection.id));
            event.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(event) => {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            const zone = event.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
            setDropTarget({ id: collection.id, zone });
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={async (event) => {
            event.preventDefault();
            const paperRaw = event.dataTransfer.getData(PAPER_DRAG_TYPE);
            if (paperRaw) {
              await handlePaperDrop(event, collection.id);
              return;
            }
            const raw = event.dataTransfer.getData(COLLECTION_DRAG_TYPE);
            if (raw && dropTarget) {
              const movedId = Number(raw);
              await handleCollectionDrop(movedId, collection.id, dropTarget.zone);
            }
          }}
        >
          <span className="tree-row-caret" onClick={(e) => { e.stopPropagation(); if (hasChildren) toggleExpand(collection.id); }}>
            {hasChildren ? (isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
          </span>
          <span className="tree-row-icon">{isOpen && hasChildren ? <FolderOpen size={13} /> : <Folder size={13} />}</span>
          {renamingId === collection.id ? (
            <input
              className="field-input tree-rename"
              autoFocus
              value={renameDraft}
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={commitRename}
              onKeyDown={(event) => {
                if (event.key === 'Enter') commitRename();
                if (event.key === 'Escape') setRenamingId(null);
              }}
              onClick={(event) => event.stopPropagation()}
            />
          ) : (
            <span className="tree-row-label" title={collection.name}>
              {collection.name}
            </span>
          )}
          <span className="tree-row-count">{collection.paperCount}</span>
        </div>
        {hasChildren && isOpen && node.children.map(renderNode)}
      </div>
    );
  };

  return (
    <div className="tree">
      <div className="tree-section-label">my vault</div>
      {fixedGroups.map((group) => (
        <button
          key={group.key}
          type="button"
          className={`tree-row ${isFilterActive(group.key) ? 'is-active' : ''}`}
          style={{ paddingLeft: 8 }}
          onClick={() => onFilterChange({ kind: 'filter', value: group.key })}
        >
          <span className="tree-row-caret" />
          <span className="tree-row-icon">{group.icon}</span>
          <span className="tree-row-label">{group.label}</span>
          <span className="tree-row-count">{group.count}</span>
        </button>
      ))}

      <div className="tree-section-label tree-section-head">
        <span>Collections</span>
        <button type="button" className="icon-btn" title="New Collection" onClick={() => onNewCollection()}>
          <Plus size={13} aria-hidden="true" />
        </button>
      </div>
      {tree.length === 0 && <div className="tree-empty">Right-click here or click + New Collection</div>}
      {tree.map(renderNode)}

      <div className="tree-section-label tree-section-head">
        <span>Tags</span>
      </div>
      {tagCounts.length === 0 && <div className="tree-empty">No Tags</div>}
      {tagCounts.map(([tag, count]) => (
        <button
          key={tag}
          type="button"
          className={`tree-row ${filterState.kind === 'tag' && filterState.value === tag ? 'is-active' : ''}`}
          style={{ paddingLeft: 8 }}
          onClick={() => onFilterChange({ kind: 'tag', value: tag })}
        >
          <span className="tree-row-caret" />
          <span className="tree-row-icon"><Tag size={13} /></span>
          <span className="tree-row-label">{tag}</span>
          <span className="tree-row-count">{count}</span>
        </button>
      ))}

      <div className="tree-section-label tree-section-head">
        <span>Trash</span>
      </div>
      <button
        type="button"
        className={`tree-row ${isFilterActive('trash') ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 }}
        onClick={() => onFilterChange({ kind: 'filter', value: 'trash' })}
      >
        <span className="tree-row-caret" />
        <span className="tree-row-icon"><Trash2 size={13} /></span>
        <span className="tree-row-label">Trash</span>
        <span className="tree-row-count">{counts.trash}</span>
      </button>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
    </div>
  );
}
