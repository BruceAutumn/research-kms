import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel,
  getGroupedRowModel, getSortedRowModel, useReactTable
} from '@tanstack/react-table';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { ChevronDown, ChevronRight, Plus, RotateCcw, Search } from 'lucide-react';
import { listPropertyKeys, listTableRows, saveNoteProperties } from '../../api/client';
import { getErrorMessage } from '../../api/client';
import { useVault } from './VaultContext';
import type { TableRow } from '../../types';

const STORAGE_KEY = 'kms.vault.table.view';

interface ViewConfig {
  visible: Record<string, boolean>;
  order: string[];
  groupByFolder: boolean;
}

function loadConfig(): ViewConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ViewConfig;
  } catch {
    // ignore
  }
  return { visible: {}, order: [], groupByFolder: false };
}

const FIXED_KEYS = ['title', 'folder', 'mtime'];

/** 可编辑属性单元格：双击 → 就地编辑 → 写回 .md frontmatter。 */
function EditableCell({ row, columnKey, onSaved }: {
  row: TableRow;
  columnKey: string;
  onSaved: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!editing) {
    return (
      <button
        type="button"
        className="vault-cell"
        title="双击编辑（写回 frontmatter）"
        onDoubleClick={() => {
          setDraft(formatValue(row[columnKey]));
          setEditing(true);
        }}
      >
        <span className={row[columnKey] === undefined || row[columnKey] === '' ? 'vault-cell-empty' : ''}>
          {row[columnKey] === undefined || row[columnKey] === '' ? '—' : formatValue(row[columnKey])}
        </span>
        {error && <span className="vault-cell-error">{error}</span>}
      </button>
    );
  }

  function commit() {
    const next = { ...(row.properties ?? {}) };
    const trimmed = draft.trim();
    if (trimmed === '' || trimmed === '—') delete next[columnKey];
    else next[columnKey] = trimmed;
    setBusy(true);
    void saveNoteProperties(row.path, next, row.mtime)
      .then(() => onSaved(row.path))
      .catch((err) => setError(getErrorMessage(err)))
      .finally(() => {
        setBusy(false);
        setEditing(false);
      });
  }

  return (
    <input
      className="field-input vault-cell-input"
      autoFocus
      disabled={busy}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.join(', ');
  if (value === null || value === undefined) return '';
  return String(value);
}

/** Database View：数据源 = 所有笔记的 frontmatter Properties（@tanstack/react-table v8）。 */
export default function DatabaseView() {
  const { requestOpen, bumpProperties } = useVault();
  const queryClient = useQueryClient();
  const rowsQuery = useQuery({ queryKey: ['vault', 'table'], queryFn: listTableRows });
  const keysQuery = useQuery({ queryKey: ['vault', 'property-keys'], queryFn: listPropertyKeys });

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [config, setConfig] = useState<ViewConfig>(() => {
    const stored = loadConfig();
    return { ...stored, groupByFolder: false };
  });
  const [groupByFolder, setGroupByFolder] = useState(false);
  const [extraKeys, setExtraKeys] = useState<string[]>([]);

  function persist(next: ViewConfig) {
    setConfig(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...next, groupByFolder: false }));
    } catch {
      // ignore
    }
  }

  const propertyKeys = [...(keysQuery.data ?? []), ...extraKeys];
  const rows = rowsQuery.data ?? [];

  const columnHelper = createColumnHelper<TableRow>();
  const columns = useMemo<ColumnDef<TableRow, any>[]>(() => {
    const defs: ColumnDef<TableRow, any>[] = [
      columnHelper.accessor('title', {
        id: 'title',
        header: 'Title',
        enableGrouping: false,
        cell: (info) => (
          <button type="button" className="vault-cell vault-cell-title" onClick={() => requestOpen(info.row.original.path)}>
            {info.getValue<string>()}
          </button>
        )
      }),
      columnHelper.accessor('folder', {
        id: 'folder',
        header: 'Folder',
        cell: (info) => <span className="vault-cell">{info.getValue<string>()}</span>
      }),
      columnHelper.accessor('mtime', {
        id: 'mtime',
        header: 'Modified',
        cell: (info) => (
          <span className="vault-cell">{new Date(info.getValue<number>()).toLocaleString('zh-CN', { hour12: false })}</span>
        )
      })
    ];
    for (const key of propertyKeys) {
      defs.push(
        columnHelper.accessor((row) => row[key], {
          id: `prop:${key}`,
          header: key,
          cell: (info) => (
            <EditableCell
              row={info.row.original}
              columnKey={key}
              onSaved={() => {
                void queryClient.invalidateQueries({ queryKey: ['vault', 'table'] });
                void queryClient.invalidateQueries({ queryKey: ['vault', 'property-keys'] });
                bumpProperties();
              }}
            />
          )
        })
      );
    }
    return defs;
  }, [propertyKeys, columnHelper, requestOpen, queryClient, bumpProperties]);

  const columnOrder = useMemo(() => {
    const stored = config.order.filter((key) => columns.some((col) => (col.id ?? '') === key));
    const all = columns.map((col) => col.id ?? '');
    const merged = [...stored, ...all.filter((key) => !stored.includes(key))];
    return merged;
  }, [columns, config.order]);

  const columnVisibility = useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const col of columns) {
      const id = col.id ?? '';
      visibility[id] = config.visible[id] ?? true;
    }
    return visibility;
  }, [columns, config.visible]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter, columnOrder, columnVisibility, grouping: groupByFolder ? ['folder'] : [] },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getGroupedRowModel: getGroupedRowModel(),
    enableGrouping: true
  });

  function toggleColumn(id: string) {
    const visible = { ...config.visible };
    visible[id] = !(visible[id] ?? true);
    persist({ ...config, visible });
  }

  function addPropertyColumn() {
    const key = window.prompt('新属性名（将写入各笔记的 frontmatter）：');
    if (!key || !key.trim()) return;
    const trimmed = key.trim();
    if (FIXED_KEYS.includes(trimmed) || propertyKeys.includes(trimmed)) return;
    setExtraKeys((prev) => [...prev, trimmed]);
  }

  function resetView() {
    persist({ visible: {}, order: [], groupByFolder: false });
    setSorting([]);
  }

  return (
    <div className="vault-table-view">
      <div className="lit-toolbar vault-table-toolbar">
        <div className="lit-toolbar-group">
          <div className="lit-toolbar-search">
            <Search size={12} />
            <input placeholder="筛选全部列…" value={globalFilter} onChange={(event) => setGlobalFilter(event.target.value)} />
          </div>
        </div>
        <div className="lit-toolbar-group">
          <button type="button" className={`btn ${groupByFolder ? 'btn-primary' : ''}`} onClick={() => setGroupByFolder((v) => !v)}>
            按文件夹分组
          </button>
          <button type="button" className="btn" onClick={addPropertyColumn}><Plus size={12} /> 新增属性列</button>
          <button type="button" className="icon-btn" title="重置视图配置" onClick={resetView}><RotateCcw size={13} /></button>
        </div>
      </div>

      <div className="vault-table-wrap">
        <table className="vault-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <th key={header.id} style={{ width: header.getSize() }}>
                      <div className={`vault-th ${canSort ? 'is-sortable' : ''}`} onClick={header.column.getToggleSortingHandler()}>
                        {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        {{
                          asc: ' ↑',
                          desc: ' ↓'
                        }[header.column.getIsSorted() as string] ?? ''}
                      </div>
                      <div className="vault-th-actions" onClick={(event) => event.stopPropagation()}>
                        <button
                          type="button"
                          className="icon-btn"
                          title={header.column.getIsVisible() ? '隐藏列' : '显示列'}
                          onClick={() => toggleColumn(header.column.id)}
                        >
                          {header.column.getIsVisible() ? '👁' : '·'}
                        </button>
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              if (row.getIsGrouped()) {
                return (
                  <tr key={row.id} className="vault-group-row">
                    <td colSpan={columns.length}>
                      <button type="button" className="vault-group-toggle" onClick={row.getToggleExpandedHandler()}>
                        {row.getIsExpanded() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                        📁 {String(row.groupingValue ?? '')}（{row.subRows.length}）
                      </button>
                    </td>
                  </tr>
                );
              }
              if (!row.getIsExpanded()) return null;
              return (
                <tr key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                  ))}
                </tr>
              );
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="vault-table-empty">暂无笔记。在文件树新建一篇，或等待 Vault 首次索引。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="vault-kp-hint vault-table-hint">
        {rows.length} 篇笔记 · 排序/筛选/分组/列显隐已持久化（kms.vault.table.view）· 双击单元格就地编辑写回 frontmatter。
      </p>
    </div>
  );
}
