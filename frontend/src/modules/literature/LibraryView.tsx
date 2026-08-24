import { useEffect, useMemo, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  FileUp,
  FolderUp,
  FolderPlus,
  Hash,
  Plus,
  Quote,
  Search,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import {
  addPapersToCollection,
  deletePaper,
  hybridSearch,
  listCollections,
  listCollectionPapers,
  listPapers,
  semanticSearch,
  updatePaper
} from '../../api/client';
import type { Collection, Paper } from '../../types';
import { Workspace, Pane, Handle } from '../../components/workspace/Workspace';
import CollectionTree from './CollectionTree';
import type { FilterState } from './CollectionTree';
import PaperTable from './PaperTable';
import InspectorPanel from './InspectorPanel';
import NewCollectionDialog from './NewCollectionDialog';
import { useLiterature } from './LiteratureContext';
import { usePdfBatchUpload } from './batchUpload';

interface LibraryViewProps {
  newCollectionOpen: boolean;
  onNewCollectionClose: () => void;
}

export default function LibraryView({ newCollectionOpen, onNewCollectionClose }: LibraryViewProps) {
  const {
    openReader,
    openImport,
    openNewCollection,
    searchTerm,
    setSearchTerm,
    searchFocusTick
  } = useLiterature();
  const queryClient = useQueryClient();
  const [filterState, setFilterState] = useState<FilterState>({ kind: 'filter', value: 'all' });
  const [debouncedQ, setDebouncedQ] = useState('');
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [tagDialog, setTagDialog] = useState<{ paperIds: number[] } | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [searchMode, setSearchMode] = useState<'keyword' | 'semantic' | 'hybrid'>('keyword');
  const [semanticResults, setSemanticResults] = useState<{ id: number; similarity?: number }[]>([]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // 搜索防抖
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQ(searchTerm.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  // Command Palette「搜索文献」→ 聚焦搜索框
  useEffect(() => {
    if (searchFocusTick > 0) searchRef.current?.focus();
  }, [searchFocusTick]);

  const papersQuery = useQuery({
    queryKey: ['papers', filterState, debouncedQ],
    queryFn: async () => {
      if (filterState.kind === 'collection') {
        const list = await listCollectionPapers(filterState.id);
        const query = debouncedQ.toLowerCase();
        return query
          ? list.filter(
              (p) =>
                p.title.toLowerCase().includes(query) ||
                (p.authors || '').toLowerCase().includes(query)
            )
          : list;
      }
      if (filterState.kind === 'tag') {
        return listPapers(debouncedQ, filterState.value, '');
      }
      return listPapers(debouncedQ, '', filterState.value);
    }
  });

  // 语义 / 混合搜索
  useEffect(() => {
    if (debouncedQ.length < 2) {
      setSemanticResults([]);
      return;
    }
    if (searchMode === 'keyword') {
      setSemanticResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        if (searchMode === 'semantic') {
          const res = await semanticSearch(debouncedQ, 'papers', 20);
          if (!cancelled) {
            setSemanticResults(res.papers.map((p) => ({ id: p.id, similarity: p.similarity })));
          }
        } else {
          const res = await hybridSearch({ query: debouncedQ, limit: 20 });
          if (!cancelled) {
            setSemanticResults(res.papers.map((p) => ({ id: p.id, similarity: p.similarity })));
          }
        }
      } catch {
        if (!cancelled) setSemanticResults([]);
      }
    })();
    return () => { cancelled = true; };
  }, [debouncedQ, searchMode]);

  // 全量列表：左侧树计数与 Tags 聚合用
  const allPapersQuery = useQuery({
    queryKey: ['papers', 'all'],
    queryFn: () => listPapers()
  });

  const collectionsQuery = useQuery({
    queryKey: ['collections'],
    queryFn: listCollections
  });

  const batch = usePdfBatchUpload(() => {
    void queryClient.invalidateQueries({ queryKey: ['papers'] });
  });

  function invalidateAll() {
    void queryClient.invalidateQueries({ queryKey: ['papers'] });
    void queryClient.invalidateQueries({ queryKey: ['collections'] });
  }

  async function handleDrop(event: DragEvent) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length > 0) {
      await batch.start(files);
    }
  }

  const inTrash = filterState.kind === 'filter' && filterState.value === 'trash';

  const collections = collectionsQuery.data || [];

  // 语义/混合模式：用搜索结果过滤并排序
  const papers = useMemo(() => {
    const all = papersQuery.data || [];
    if (searchMode === 'keyword' || semanticResults.length === 0) return all;
    const simMap = new Map(semanticResults.map((r) => [r.id, r.similarity ?? 0]));
    return all
      .filter((p) => simMap.has(p.id))
      .sort((a, b) => (simMap.get(b.id) ?? 0) - (simMap.get(a.id) ?? 0));
  }, [papersQuery.data, semanticResults, searchMode]);

  const selectionHandlers = useMemo(
    () => ({
      onSelectionChange: (ids: Set<number>, primary: number | null) => {
        setSelectedIds(ids);
        setPrimaryId(primary);
      },
      onToggleFavorite: async (paper: Paper) => {
        await updatePaper(paper.id, { favorite: !paper.favorite });
        invalidateAll();
      },
      onAddToCollection: async (collectionId: number, paperIds: number[]) => {
        await addPapersToCollection(collectionId, paperIds);
        invalidateAll();
      },
      onMoveToTrash: async (paperIds: number[]) => {
        for (const id of paperIds) await updatePaper(id, { trashed: true });
        setSelectedIds(new Set());
        invalidateAll();
      },
      onRestore: async (paperIds: number[]) => {
        for (const id of paperIds) await updatePaper(id, { trashed: false });
        invalidateAll();
      },
      onDeletePermanently: async (paperIds: number[]) => {
        if (!window.confirm(`永久删除 ${paperIds.length} 篇文献（含磁盘 PDF）？此操作不可恢复。`)) return;
        for (const id of paperIds) await deletePaper(id);
        setSelectedIds(new Set());
        invalidateAll();
      },
      onAddTags: (paperIds: number[]) => setTagDialog({ paperIds }),
      onNewCollection: () => openNewCollection(),
      onOpenReader: (paper: Paper) => openReader(paper)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [openReader, openNewCollection]
  );

  const primaryPaper = papers.find((p) => p.id === primaryId) ?? null;

  return (
    <div className="lit-library">
      {/* Toolbar：单行 36px */}
      <div className="lit-toolbar">
        <div className="lit-toolbar-group">
          <div className="dropdown">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAddMenuOpen((open) => !open)}
              onBlur={() => window.setTimeout(() => setAddMenuOpen(false), 120)}
            >
              <Plus size={14} aria-hidden="true" />
              添加
              <ChevronDown size={12} aria-hidden="true" />
            </button>
            {addMenuOpen && (
              <div className="dropdown-menu">
                <button type="button" className="dropdown-item" onClick={() => { setAddMenuOpen(false); openImport('pdf'); }}>
                  <FileUp size={13} aria-hidden="true" /> 导入 PDF
                </button>
                <button type="button" className="dropdown-item" onClick={() => { setAddMenuOpen(false); openImport('folder'); }}>
                  <FolderUp size={13} aria-hidden="true" /> 导入文件夹
                </button>
                <button type="button" className="dropdown-item" onClick={() => { setAddMenuOpen(false); openImport('doi'); }}>
                  <Hash size={13} aria-hidden="true" /> 导入 DOI
                </button>
                <button type="button" className="dropdown-item" onClick={() => { setAddMenuOpen(false); openImport('bibtex'); }}>
                  <Quote size={13} aria-hidden="true" /> 导入 BibTeX
                </button>
              </div>
            )}
          </div>
          <button type="button" className="btn" onClick={() => openNewCollection()}>
            <FolderPlus size={14} aria-hidden="true" />
            新建 Collection
          </button>
        </div>
        <div className="lit-toolbar-search">
          <Search size={13} aria-hidden="true" />
          <input
            ref={searchRef}
            placeholder="搜索文献…"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchTerm('');
            }}
          />
          {searchTerm && (
            <button type="button" className="icon-btn" title="清空搜索" onClick={() => setSearchTerm('')}>
              <X size={12} aria-hidden="true" />
            </button>
          )}
          <div className="search-mode-toggle">
            <button
              type="button"
              className={`search-mode-btn ${searchMode === 'keyword' ? 'is-active' : ''}`}
              title="关键词搜索"
              onClick={() => setSearchMode('keyword')}
            >
              <Search size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`search-mode-btn ${searchMode === 'semantic' ? 'is-active' : ''}`}
              title="语义搜索"
              onClick={() => setSearchMode('semantic')}
            >
              <Sparkles size={11} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={`search-mode-btn ${searchMode === 'hybrid' ? 'is-active' : ''}`}
              title="混合搜索（关键词 + 语义）"
              onClick={() => setSearchMode('hybrid')}
            >
              <Zap size={11} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <Workspace
        storageKey="kms.layout.literature"
        defaultLayout={[20, 55, 25]}
        minSizes={[12, 35, 15]}
        maxSizes={[30, undefined, 35]}
        responsive={{ collapseRightBelow: 1440, collapseLeftBelow: 1100 }}
      >
        <Pane stack title="Collections" shaded>
          <CollectionTree
            collections={collections}
            allPapers={allPapersQuery.data || []}
            filterState={filterState}
            onFilterChange={(next) => {
              setFilterState(next);
              setSelectedIds(new Set());
              setPrimaryId(null);
            }}
            onMutated={invalidateAll}
            onNewCollection={(parentId) => openNewCollection()}
          />
        </Pane>
        <Handle />
        <Pane stack title="Papers">
          <div
            className={`lit-papers ${dragOver ? 'is-dragover' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              if (event.dataTransfer.types.includes('Files')) setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <PaperTable
              papers={papers}
              loading={papersQuery.isLoading}
              selectedIds={selectedIds}
              primaryId={primaryId}
              collections={collections}
              inTrash={inTrash}
              {...selectionHandlers}
            />
          </div>
        </Pane>
        <Handle />
        <Pane stack title="Inspector">
          <InspectorPanel
            paper={primaryPaper}
            onPaperUpdated={invalidateAll}
            onOpenReader={(paper) => openReader(paper)}
            onOpenExtraction={() => undefined}
          />
        </Pane>
      </Workspace>

      {newCollectionOpen && (
        <NewCollectionDialog
          collections={collections}
          onClose={onNewCollectionClose}
          onCreated={invalidateAll}
        />
      )}
      {tagDialog && (
        <TagEditDialog
          paperIds={tagDialog.paperIds}
          papers={papers}
          onClose={() => setTagDialog(null)}
          onSaved={invalidateAll}
        />
      )}
    </div>
  );
}

interface TagEditDialogProps {
  paperIds: number[];
  papers: Paper[];
  onClose: () => void;
  onSaved: () => void;
}

function TagEditDialog({ paperIds, papers, onClose, onSaved }: TagEditDialogProps) {
  const [draft, setDraft] = useState('');
  const targetPapers = papers.filter((p) => paperIds.includes(p.id));

  async function save() {
    const added = draft.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
    for (const paper of targetPapers) {
      const merged = [...new Set([...(paper.tags || []), ...added])];
      await updatePaper(paper.id, { tags: merged });
    }
    onSaved();
    onClose();
  }

  return (
    <div className="dialog-shell" role="dialog" aria-modal="true">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog">
        <div className="dialog-header">
          <span className="dialog-title">加标签</span>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="dialog-body">
          <p className="dialog-desc">为选中的 {targetPapers.length} 篇文献添加标签（逗号分隔）：</p>
          <input
            className="field-input"
            autoFocus
            value={draft}
            placeholder="例如：cesium, adsorption"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void save();
              if (event.key === 'Escape') onClose();
            }}
          />
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" onClick={() => void save()}>保存</button>
        </div>
      </div>
    </div>
  );
}
