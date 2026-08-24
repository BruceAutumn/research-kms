import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import type { ColumnDef, SortingState, VisibilityState, ColumnOrderState, ColumnSizingState } from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bot,
  FileText,
  FolderPlus,
  Star,
  Tags,
  Trash2,
  RotateCcw,
  EyeOff,
  Eraser
} from 'lucide-react';
import type { AiStatus, Collection, Paper } from '../../types';
import ContextMenu from './ContextMenu';
import type { MenuItem, MenuState } from './ContextMenu';
import { PAPER_DRAG_TYPE } from './CollectionTree';
import { dispatchAiAction } from '../ai/AiStudioContext';

export const AI_STATUS_META: Record<AiStatus, { label: string; cls: string }> = {
  NOT_PROCESSED: { label: '--', cls: 'is-tertiary' },
  QUEUED: { label: 'Queued', cls: 'is-secondary' },
  READING: { label: 'Reading', cls: 'is-accent' },
  EXTRACTING: { label: 'Extracting', cls: 'is-accent' },
  REVIEW_REQUIRED: { label: 'Pending Confirm', cls: 'is-warning' },
  COMPLETED: { label: 'v', cls: 'is-success' },
  FAILED: { label: '!', cls: 'is-danger' }
};

export interface TableColumnConfig {
  id: string;
  label: string;
  defaultSize: number;
  sortable?: boolean;
  defaultVisible?: boolean;
  render: (paper: Paper, callbacks: PaperTableProps) => React.ReactNode;
}

/**
 * Zotero journal metric tag. 
 *
 * Zotero those in IF 26.8 / SCI Q1 / CAS engineering1area Journal DB from third-party plugin, 
 * this project lacks that authData, so change to fromPaperown tags recognize in --
 * you(or AI extract)  "IF 4.7", "SCI Q2", "CAS Chemistry2area" As Tag, 
 * thisinthenBytypeRenderinto same color chip. unrecognizedTagstillBynormalTagshow. 
 */
const METRIC_PATTERNS: Array<{ test: RegExp; cls: string }> = [
  { test: /^IF\s*[\d.]+$/i, cls: 'pt-metric-if' },
  { test: /^SCI\s*Q[1-4]$/i, cls: 'pt-metric-sci' },
  { test: /^SSCI\s*Q[1-4]$/i, cls: 'pt-metric-ssci' },
  { test: /^AJG\s*\d\*?$/i, cls: 'pt-metric-ajg' },
  { test: /CAS|CAS\s*Q/i, cls: 'pt-metric-cas' }
];

function metricClass(tag: string): string | null {
  const hit = METRIC_PATTERNS.find((m) => m.test.test(tag.trim()));
  return hit ? hit.cls : null;
}

const READ_STATUS_LABEL: Record<string, string> = {
  unread: 'unread',
  reading: 'reading',
  done: 'done'
};

const COLUMN_CONFIGS: TableColumnConfig[] = [
  {
    id: 'title', label: 'Title', defaultSize: 320, sortable: true,
    render: (paper) => <span className="pt-title" title={paper.title}>{paper.title}</span>
  },
  {
    id: 'readStatus', label: 'state', defaultSize: 84, sortable: true,
    render: (paper) => {
      const status = paper.readStatus || 'unread';
      return <span className={`pt-status is-${status}`}>* {READ_STATUS_LABEL[status]}</span>;
    }
  },
  {
    id: 'rating', label: 'Rating', defaultSize: 92, sortable: true,
    render: (paper) => {
      const rating = paper.rating ?? 0;
      if (rating === 0) return <span className="pt-muted">--</span>;
      return <span className="pt-rating">{'<3'.repeat(rating)}</span>;
    }
  },
  {
    id: 'metrics', label: 'Journal Tag', defaultSize: 210,
    render: (paper) => {
      const metrics = (paper.tags || []).filter((tag) => metricClass(tag));
      if (metrics.length === 0) return <span className="pt-muted">--</span>;
      return (
        <span className="pt-tags">
          {metrics.map((tag) => (
            <span key={tag} className={`pt-metric ${metricClass(tag)}`}>{tag}</span>
          ))}
        </span>
      );
    }
  },
  {
    id: 'authors', label: 'Author', defaultSize: 170, sortable: true,
    render: (paper) => <span className="pt-muted">{paper.authors || '--'}</span>
  },
  {
    id: 'year', label: 'Year', defaultSize: 56, sortable: true,
    render: (paper) => <span className="pt-muted">{paper.year ?? '--'}</span>
  },
  {
    id: 'journal', label: 'Journal', defaultSize: 150, sortable: true,
    render: (paper) => <span className="pt-muted">{paper.journal || '--'}</span>
  },
  {
    id: 'doi', label: 'DOI', defaultSize: 140,
    render: (paper) => <span className="pt-muted pt-mono">{paper.doi || '--'}</span>
  },
  {
    id: 'tags', label: 'Tags', defaultSize: 130,
    render: (paper) => (
      <span className="pt-tags">
        {(paper.tags || []).filter((tag) => !metricClass(tag)).slice(0, 3).map((tag) => (
          <span key={tag} className="pt-tag">{tag}</span>
        ))}
      </span>
    )
  },
  {
    id: 'status', label: 'Status', defaultSize: 64,
    render: (paper, callbacks) => (
      <button
        type="button"
        className={`pt-fav ${paper.favorite ? 'is-on' : ''}`}
        title={paper.favorite ? 'Unfavorite' : 'Favorite'}
        onClick={(event) => {
          event.stopPropagation();
          callbacks.onToggleFavorite(paper);
        }}
      >
        <Star size={13} aria-hidden="true" />
      </button>
    )
  },
  {
    id: 'pdf', label: 'PDF', defaultSize: 44,
    render: (paper) => (
      <span className="pt-pdf" title={paper.pdfPath ? 'has PDF Attachment' : 'no PDF(DOI import)'}>
        <FileText size={13} aria-hidden="true" />
      </span>
    )
  },
  {
    id: 'aiStatus', label: 'AI Status', defaultSize: 92,
    render: (paper) => {
      const meta = AI_STATUS_META[paper.aiStatus] || AI_STATUS_META.NOT_PROCESSED;
      return <span className={`ai-chip ${meta.cls}`}>{meta.label}</span>;
    }
  },
  {
    id: 'dateAdded', label: 'Date Added', defaultSize: 108, sortable: true,
    render: (paper) => <span className="pt-muted">{formatDate(paper.createdAt)}</span>
  },
  {
    id: 'dateModified', label: 'Date Modified', defaultSize: 108, sortable: true,
    render: (paper) => <span className="pt-muted">{paper.dateModified ? formatDate(paper.dateModified) : '--'}</span>
  }
];

function formatDate(value?: string): string {
  if (!value) return '--';
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const COLUMN_STORAGE_KEY = 'kms.literature.table.columns';

interface StoredColumns {
  visibility: VisibilityState;
  order: ColumnOrderState;
  sizing: ColumnSizingState;
}

function loadColumns(): StoredColumns {
  const defaults: StoredColumns = {
    visibility: Object.fromEntries(COLUMN_CONFIGS.map((c) => [c.id, c.defaultVisible !== false])),
    order: COLUMN_CONFIGS.map((c) => c.id),
    sizing: Object.fromEntries(COLUMN_CONFIGS.map((c) => [c.id, c.defaultSize]))
  };
  try {
    const raw = localStorage.getItem(COLUMN_STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<StoredColumns>;
    return {
      visibility: { ...defaults.visibility, ...(parsed.visibility || {}) },
      order: parsed.order && parsed.order.length === COLUMN_CONFIGS.length ? parsed.order : defaults.order,
      sizing: { ...defaults.sizing, ...(parsed.sizing || {}) }
    };
  } catch {
    return defaults;
  }
}

interface PaperTableProps {
  papers: Paper[];
  loading: boolean;
  selectedIds: Set<number>;
  primaryId: number | null;
  onSelectionChange: (ids: Set<number>, primary: number | null) => void;
  onOpenReader: (paper: Paper) => void;
  collections: Collection[];
  onAddToCollection: (collectionId: number, paperIds: number[]) => Promise<void>;
  onNewCollection: () => void;
  onAddTags: (paperIds: number[]) => void;
  onToggleFavorite: (paper: Paper) => void;
  onMoveToTrash: (paperIds: number[]) => void;
  onRestore: (paperIds: number[]) => void;
  onDeletePermanently: (paperIds: number[]) => void;
  inTrash: boolean;
}

export default function PaperTable(props: PaperTableProps) {
  const { papers, loading } = props;
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => loadColumns().visibility);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(() => loadColumns().order);
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => loadColumns().sizing);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [headerMenu, setHeaderMenu] = useState<MenuState | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const lastClickIndexRef = useRef(-1);
  const dragColumnIdRef = useRef<string | null>(null);

  // Column Config Persistence(Keep after refresh)
  useEffect(() => {
    try {
      localStorage.setItem(
        COLUMN_STORAGE_KEY,
        JSON.stringify({ visibility: columnVisibility, order: columnOrder, sizing: columnSizing } satisfies StoredColumns)
      );
    } catch {
      // ignore
    }
  }, [columnVisibility, columnOrder, columnSizing]);

  const columns = useMemo<ColumnDef<Paper>[]>(
    () =>
      COLUMN_CONFIGS.map((config) => ({
        id: config.id,
        header: config.label,
        accessorFn: (row: Paper): unknown => {
          switch (config.id) {
            case 'title': return row.title;
            case 'authors': return row.authors || '';
            case 'year': return row.year ?? -1;
            case 'journal': return row.journal || '';
            case 'readStatus': return row.readStatus || 'unread';
            case 'rating': return row.rating ?? 0;
            case 'dateAdded': return row.createdAt || '';
            case 'dateModified': return row.dateModified || '';
            default: return null;
          }
        },
        enableSorting: Boolean(config.sortable)
      })),
    []
  );

  const table = useReactTable({
    data: papers,
    columns,
    state: { sorting, columnVisibility, columnOrder, columnSizing },
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    onColumnSizingChange: setColumnSizing,
    columnResizeMode: 'onChange',
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const flatHeaders = table.getFlatHeaders();
  const gridTemplate = visibleColumns.map((column) => `${column.getSize()}px`).join(' ');

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 28,
    overscan: 24
  });

  function handleRowClick(event: ReactMouseEvent, paper: Paper, index: number) {
    const { selectedIds, primaryId, onSelectionChange } = props;
    if (event.metaKey || event.ctrlKey) {
      const next = new Set(selectedIds);
      if (next.has(paper.id)) next.delete(paper.id);
      else next.add(paper.id);
      lastClickIndexRef.current = index;
      onSelectionChange(next, paper.id);
    } else if (event.shiftKey && primaryId !== null) {
      const start = lastClickIndexRef.current;
      const end = index;
      const lo = Math.min(start, end);
      const hi = Math.max(start, end);
      const next = new Set<number>();
      for (let i = lo; i <= hi; i += 1) {
        const row = rows[i];
        if (row) next.add(row.original.id);
      }
      onSelectionChange(next, primaryId);
    } else {
      lastClickIndexRef.current = index;
      onSelectionChange(new Set([paper.id]), paper.id);
    }
  }

  function rowMenu(paper: Paper): MenuItem[] {
    const ids = props.selectedIds.has(paper.id) ? Array.from(props.selectedIds) : [paper.id];
    const collectionItems: MenuItem[] = [
      {
        label: 'New Collection...',
        icon: <FolderPlus size={13} />,
        onClick: () => props.onNewCollection()
      }
    ];
    if (props.collections.length > 0) {
      collectionItems.push({ label: '------', disabled: true, onClick: () => undefined });
      for (const collection of props.collections) {
        collectionItems.push({
          label: collection.name,
          icon: <Tags size={13} />,
          onClick: () => void props.onAddToCollection(collection.id, ids)
        });
      }
    }
    const items: MenuItem[] = [
      { label: 'open PDF', icon: <FileText size={13} />, onClick: () => props.onOpenReader(paper) },
      { label: 'Join Collection', icon: <FolderPlus size={13} />, children: collectionItems },
      { label: 'Add Tag', icon: <Tags size={13} />, onClick: () => props.onAddTags(ids) },
      {
        label: 'Run Agent',
        icon: <Bot size={13} />,
        onClick: () => dispatchAiAction({
          type: 'run-agent',
          source: 'paper',
          label: ids.length === 1 ? paper.title : `${ids.length} paperPaper`,
          instruction: ids.length === 1
            ? `Please read and analyze the paper"${paper.title}", Output key points, method, Limits and writable Obsidian  Notedraft. `
            : `Please analyze selected ${ids.length} paperPaper, Induce common topics, diffandfollow-upReadingorder. `,
          contextRefs: ids.map((id) => ({ type: 'paper', id, label: id === paper.id ? paper.title : `Paper #${id}` }))
        })
      }
    ];
    if (props.inTrash) {
      items.push({ label: 'Resume', icon: <RotateCcw size={13} />, onClick: () => props.onRestore(ids) });
      items.push({ label: 'Permanent Delete', icon: <Trash2 size={13} />, danger: true, onClick: () => props.onDeletePermanently(ids) });
    } else {
      items.push({ label: 'Move to Trash', icon: <Trash2 size={13} />, danger: true, onClick: () => props.onMoveToTrash(ids) });
    }
    return items;
  }

  function headerContextMenu(): MenuItem[] {
    const items: MenuItem[] = COLUMN_CONFIGS.map((config) => ({
      label: config.label,
      icon: columnVisibility[config.id] !== false ? <EyeOff size={13} /> : undefined,
      onClick: () =>
        setColumnVisibility((old) => ({ ...old, [config.id]: old[config.id] === false }))
    }));
    items.push(
      { label: '------', disabled: true, onClick: () => undefined },
      {
        label: 'Restore Default Columns',
        icon: <Eraser size={13} />,
        onClick: () => {
          const defaults = loadColumns();
          setColumnVisibility(defaults.visibility);
          setColumnOrder(defaults.order);
          setColumnSizing(defaults.sizing);
          setSorting([]);
        }
      }
    );
    return items;
  }

  function moveColumn(dragId: string, targetId: string) {
    setColumnOrder((old) => {
      const from = old.indexOf(dragId);
      const to = old.indexOf(targetId);
      if (from < 0 || to < 0) return old;
      const next = [...old];
      next.splice(from, 1);
      next.splice(to, 0, dragId);
      return next;
    });
  }

  const renderCell = (paper: Paper, columnId: string): React.ReactNode => {
    const config = COLUMN_CONFIGS.find((c) => c.id === columnId);
    if (!config) return null;
    return config.render(paper, props);
  };

  return (
    <div className="pt-root">
      {/* Table Head: Clickable Sort / Drag Column Width / Drag Swap Column / Right-click hide */}
      <div className="pt-header" style={{ gridTemplateColumns: gridTemplate }}>
        {flatHeaders.map((header) => {
          const sorted = sorting.find((s) => s.id === header.column.id);
          const config = COLUMN_CONFIGS.find((c) => c.id === header.column.id);
          return (
            <div
              key={header.id}
              className={`pt-th ${config?.sortable ? 'is-sortable' : ''}`}
              style={{ width: header.getSize() }}
              draggable
              onDragStart={() => {
                dragColumnIdRef.current = header.column.id;
              }}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => {
                if (dragColumnIdRef.current && dragColumnIdRef.current !== header.column.id) {
                  moveColumn(dragColumnIdRef.current, header.column.id);
                }
                dragColumnIdRef.current = null;
              }}
              onClick={(event) => {
                if (config?.sortable && !event.defaultPrevented) {
                  const next: SortingState = sorted
                    ? sorted.desc
                      ? []
                      : [{ id: header.column.id, desc: true }]
                    : [{ id: header.column.id, desc: false }];
                  setSorting(next);
                }
              }}
              onContextMenu={(event) => {
                event.preventDefault();
                setHeaderMenu({ x: event.clientX, y: event.clientY, items: headerContextMenu() });
              }}
            >
              <span className="pt-th-label">
                {config?.label}
                {sorted && (sorted.desc ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
                {!sorted && config?.sortable && <ArrowUpDown size={11} className="pt-th-sort-hint" />}
              </span>
              <span
                className="pt-resizer"
                role="separator"
                aria-orientation="vertical"
                onMouseDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  header.getResizeHandler()(event);
                }}
                onDoubleClick={(event) => {
                  event.preventDefault();
                  header.column.resetSize();
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Virtualized Row Area: 500-5000 Line no lag, Inline no animation no shadow */}
      <div className="pt-scroll" ref={scrollRef}>
        {loading && papers.length === 0 && <div className="pt-loading">Loading...</div>}
        {!loading && papers.length === 0 && (
          <div className="pt-empty">
            <p>No matching papers</p>
            <p className="pt-empty-hint">Drag In PDF File ready to import</p>
          </div>
        )}
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            const paper = row.original;
            const isSelected = props.selectedIds.has(paper.id);
            return (
              <div
                key={paper.id}
                ref={rowVirtualizer.measureElement}
                data-index={virtualRow.index}
                className={`pt-row ${isSelected ? 'is-selected' : ''} ${props.primaryId === paper.id ? 'is-primary' : ''}`}
                style={{ transform: `translateY(${virtualRow.start}px)`, gridTemplateColumns: gridTemplate }}
                draggable
                onClick={(event) => handleRowClick(event, paper, virtualRow.index)}
                onDoubleClick={() => props.onOpenReader(paper)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ x: event.clientX, y: event.clientY, items: rowMenu(paper) });
                }}
                onDragStart={(event: DragEvent) => {
                  const ids = props.selectedIds.has(paper.id)
                    ? Array.from(props.selectedIds)
                    : [paper.id];
                  event.dataTransfer.setData(PAPER_DRAG_TYPE, JSON.stringify(ids));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                {visibleColumns.map((column) => (
                  <div key={column.id} className="pt-cell" style={{ width: column.getSize() }}>
                    {renderCell(paper, column.id)}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <ContextMenu menu={headerMenu} onClose={() => setHeaderMenu(null)} />
    </div>
  );
}
