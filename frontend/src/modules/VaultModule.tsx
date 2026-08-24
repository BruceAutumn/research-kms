import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Workspace, Pane, Handle } from '../components/workspace/Workspace';
import { createVaultNote, listTableRows } from '../api/client';
import { VaultContext, consumeVaultAction, listenVaultAction } from './vault/VaultContext';
import type { VaultAction } from './vault/VaultContext';
import type { VaultTab } from '../types';
import FileExplorer from './vault/FileExplorer';
import KnowledgePanel from './vault/KnowledgePanel';

// Code Splitting(No.TenOnesection): CodeMirror Editor and Database View Lazy Load
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

/** Knowledge Vault Module: Three Column = File Tree | Editdevice | Knowledge Panel.  */
export default function VaultModule() {
  const [tabState, setTabState] = useState<PersistedTabs>(() => loadTabs());
  const [treeTick, setTreeTick] = useState(0);
  const [view, setView] = useState<'files' | 'table'>('files');
  const [scrollRequest, setScrollRequest] = useState<{ path: string; line: number; seq: number } | null>(null);
  const scrollSeqRef = useRef(0);
  const [propertiesTick, setPropertiesTick] = useState(0);
  const [activeContent, setActiveContent] = useState('');
  const [pendingAction, setPendingAction] = useState<VaultAction | null>(null);

  const tableQuery = useQuery({ queryKey: ['vault', 'table'], queryFn: listTableRows });

  // Tab state persist: Restore open files and activity after refresh Tab
  useEffect(() => {
    try {
      localStorage.setItem(TABS_KEY, JSON.stringify(tabState));
    } catch {
      // ignore
    }
  }, [tabState]);

  // External file change SSE: Poll scanner broadcast -> Refresh file tree
  useEffect(() => {
    const source = new EventSource('/api/vault/watch');
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

  // Action Bus: Command Palette -> In-module Dialog
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

  /** Title or Path -> open; if not existHint Create(Wiki Link Click / Graph Node Click).  */
  const requestOpen = useCallback((titleOrPath: string) => {
    if (titleOrPath.includes('/')) {
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
    if (window.confirm(`Note"${title}"not exist, wantCreatethisNote?? `)) {
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
            <Suspense fallback={<div className="tree-empty">Load Table...</div>}>
              <DatabaseView />
            </Suspense>
          )}
        </Pane>
        <Handle />
        <Pane stack title="Editor">
          <Suspense fallback={<div className="vault-editor-loading">Load Editor...</div>}>
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
