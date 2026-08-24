import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Workspace, Pane, Handle } from '../components/workspace/Workspace';
import { apiUrl, createVaultNote, listTableRows } from '../api/client';
import { VaultContext, consumeVaultAction, listenVaultAction } from './vault/VaultContext';
import type { VaultAction } from './vault/VaultContext';
import type { VaultTab } from '../types';
import FileExplorer from './vault/FileExplorer';
import KnowledgePanel from './vault/KnowledgePanel';

// 代码分割（第十一节）：CodeMirror 编辑器与 Database View 懒加载
const EditorPane = lazy(() => import('./vault/EditorPane'));
const DatabaseView = lazy(() => import('./vault/DatabaseView'));

const TABS_KEY = 'kms.vault.tabs';

interface PersistedTabs {
  tabs: VaultTab[];
  active: string | null;
}

function loadTabs(): PersistedTabs {
  try {
    const raw = localStorage.getItem(TABS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PersistedTabs;
      if (Array.isArray(parsed.tabs)) return parsed;
    }
  } catch {
    // ignore
  }
  return { tabs: [], active: null };
}

/** Knowledge Vault 模块：三栏 = 文件树 ｜ 编辑器 ｜ Knowledge Panel。 */
export default function VaultModule() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tabState, setTabState] = useState<PersistedTabs>(() => loadTabs());
  const [treeTick, setTreeTick] = useState(0);
  const [view, setView] = useState<'files' | 'table'>('files');
  const [scrollRequest, setScrollRequest] = useState<{ path: string; line: number; seq: number } | null>(null);
  const scrollSeqRef = useRef(0);
  const [propertiesTick, setPropertiesTick] = useState(0);
  const [activeContent, setActiveContent] = useState('');
  const [pendingAction, setPendingAction] = useState<VaultAction | null>(null);

  const tableQuery = useQuery({ queryKey: ['vault', 'table'], queryFn: listTableRows });

  // Tab 状态持久化：刷新后恢复打开的文件与活动 Tab
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabState));
    } catch {
      // ignore
    }
  }, [tabState]);

  // 外部文件修改 SSE：轮询扫描器广播 → 刷新文件树
  useEffect(() => {
    const source = new EventSource(apiUrl('/vault/watch'));
    const onMessage = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as { type: string };
        if (payload.type === 'changed') {
          setTreeTick((tick) => tick + 1);
        }
      } catch {
        // ignore
      }
    };
    source.addEventListener('vault-change', onMessage);
    return () => source.close();
  }, []);

  // 动作总线：Command Palette → 模块内对话框
  useEffect(() => {
    const pending = consumeVaultAction();
    if (pending) setPendingAction(pending);
    return listenVaultAction(setPendingAction);
  }, []);

  const openNote = useCallback((path: string, title: string) => {
    setTabState((prev) => {
      const existing = prev.tabs.find((tab) => tab.path === path);
      if (existing) {
        return { tabs: prev.tabs, active: path };
      }
      return { tabs: [...prev.tabs, { path, title }], active: path };
    });
    setActiveContent('');
  }, []);

  const closeTab = useCallback((path: string) => {
    setTabState((prev) => {
      const index = prev.tabs.findIndex((tab) => tab.path === path);
      if (index < 0) return prev;
      const tabs = prev.tabs.filter((tab) => tab.path !== path);
      let active = prev.active;
      if (active === path) {
        const next = tabs[Math.max(0, index - 1)] ?? tabs[0] ?? null;
        active = next ? next.path : null;
      }
      return { tabs, active };
    });
  }, []);

  const moveTab = useCallback((from: number, to: number) => {
    setTabState((prev) => {
      const tabs = [...prev.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { tabs, active: prev.active };
    });
  }, []);

  const togglePinTab = useCallback((path: string) => {
    setTabState((prev) => ({
      tabs: prev.tabs.map((tab) => (tab.path === path ? { ...tab, pinned: !tab.pinned } : tab)),
      active: prev.active
    }));
  }, []);

  /** 标题或路径 → 打开；不存在则提示创建（Wiki Link 点击 / Graph 节点点击）。 */
  const requestOpen = useCallback((titleOrPath: string) => {
    // 根目录文件的 path 没有 `/`，但仍以 `.md` 结尾。若只按斜杠判断，
    // Backlinks / Outgoing Links 会把 `note.md` 当成标题并误建 `note.md.md`。
    if (titleOrPath.includes('/') || /\.md$/i.test(titleOrPath)) {
      const title = titleOrPath.split('/').pop()?.replace(/\.md$/i, '') ?? titleOrPath;
      openNote(titleOrPath, title);
      return;
    }
    const title = titleOrPath;
    const hit = (tableQuery.data ?? []).find((row) => row.title === title);
    if (hit) {
      openNote(hit.path, hit.title);
      return;
    }
    if (window.confirm(`笔记「${title}」不存在，要创建这篇笔记吗？`)) {
      void createVaultNote('', title, `# ${title}\n`).then((result) => {
        setTreeTick((tick) => tick + 1);
        openNote(result.path, result.title);
      });
    }
  }, [tableQuery.data, openNote]);

  const api = useMemo(
    () => ({
      tabs: tabState.tabs,
      activePath: tabState.active,
      openNote,
      closeTab,
      moveTab,
      togglePinTab,
      treeTick,
      refreshTree: () => setTreeTick((tick) => tick + 1),
      requestOpen,
      scrollRequest,
      requestScroll: (path: string, line: number) => {
        scrollSeqRef.current += 1;
        setScrollRequest({ path, line, seq: scrollSeqRef.current });
      },
      propertiesTick,
      bumpProperties: () => setPropertiesTick((tick) => tick + 1),
      activeContent,
      setActiveContent,
      pendingAction,
      clearPendingAction: () => setPendingAction(null)
    }),
    [tabState, openNote, closeTab, moveTab, togglePinTab, treeTick, requestOpen, scrollRequest, propertiesTick, activeContent, pendingAction]
  );

  // 全局搜索深链：Vault 以磁盘相对路径为稳定身份，不依赖会随索引变化的数据库 ID。
  useEffect(() => {
    const path = searchParams.get('path');
    if (!path || tableQuery.isLoading) return;
    const hit = (tableQuery.data ?? []).find((row) => row.path === path);
    const title = hit?.title ?? path.split('/').pop()?.replace(/\.md$/i, '') ?? path;
    openNote(path, title);
    const next = new URLSearchParams(searchParams);
    next.delete('path');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, tableQuery.data, tableQuery.isLoading, openNote]);

  return (
    <VaultContext.Provider value={api}>
      <Workspace
        storageKey="kms.layout.vault"
        defaultLayout={[20, 55, 25]}
        minSizes={[12, 35, 15]}
        maxSizes={[30, undefined, 35]}
        responsive={{ collapseRightBelow: 1440, collapseLeftBelow: 1100 }}
      >
        <Pane stack title="Files" shaded>
          <FileExplorer view={view} onViewChange={setView} />
          {view === 'table' && (
            <Suspense fallback={<div className="tree-empty">加载表格…</div>}>
              <DatabaseView />
            </Suspense>
          )}
        </Pane>
        <Handle />
        <Pane stack title="Editor">
          <Suspense fallback={<div className="vault-editor-loading">加载编辑器…</div>}>
            <EditorPane />
          </Suspense>
        </Pane>
        <Handle />
        <Pane stack title="Knowledge">
          <KnowledgePanel />
        </Pane>
      </Workspace>
    </VaultContext.Provider>
  );
}
