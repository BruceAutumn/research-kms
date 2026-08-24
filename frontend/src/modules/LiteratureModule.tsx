import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Library, FileText, Sparkles, X, GripVertical } from 'lucide-react';
import {
  consumeLiteratureAction,
  listenLiteratureAction,
  LiteratureContext
} from './literature/LiteratureContext';
import type { ImportMode, LiteratureApi, ReaderTab } from './literature/LiteratureContext';
import type { Paper } from '../types';
import LibraryView from './literature/LibraryView';
import ExtractionView from './literature/ExtractionView';
import ImportDialog from './literature/ImportDialog';

// Code Splitting(No.TenOnesection): Reader(pdf.js Largehead)Lazy Load
const ReaderView = lazy(() => import('./literature/ReaderView'));

const UI_STORAGE_KEY = 'kms.literature.ui';

interface UiState {
  activeView: string;
  readerTabs: ReaderTab[];
}

function loadUiState(): UiState {
  try {
    const raw = localStorage.getItem(UI_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UiState;
      return {
        activeView: typeof parsed.activeView === 'string' ? parsed.activeView : 'library',
        readerTabs: Array.isArray(parsed.readerTabs) ? parsed.readerTabs : []
      };
    }
  } catch {
    // ignore corrupted state
  }
  return { activeView: 'library', readerTabs: [] };
}

export default function LiteratureModule() {
  const [uiState, setUiState] = useState<UiState>(loadUiState);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const [importMode, setImportMode] = useState<ImportMode | null>(null);
  const [newCollectionOpen, setNewCollectionOpen] = useState(false);
  const [extractionPaperId, setExtractionPaperId] = useState<number | null>(null);

  // persist: Tab open stateandActiveview, Restore after refresh
  useEffect(() => {
    try {
      localStorage.setItem(UI_STORAGE_KEY, JSON.stringify(uiState));
    } catch {
      // ignore quota errors
    }
  }, [uiState]);

  /**
   * in note [[paper:N#ann-M]] back-jump landPoint: /literature?paper=N&ann=M
   * Clear params after one read, Avoid refresh/Cut tab then pulled back toOneatAnnotation. 
   */
  const [searchParams, setSearchParams] = useSearchParams();
  const [focusAnnotationId, setFocusAnnotationId] = useState<number | null>(null);

  const openReader = useCallback((paper: Paper) => {
    setUiState((old) => {
      const exists = old.readerTabs.some((tab) => tab.paperId === paper.id);
      const tabs = exists
        ? old.readerTabs
        : [...old.readerTabs, { paperId: paper.id, title: paper.title }];
      return { readerTabs: tabs, activeView: `reader:${paper.id}` };
    });
    setImportMode(null);
  }, []);

  const closeReaderTab = useCallback((paperId: number) => {
    setUiState((old) => {
      const tabs = old.readerTabs.filter((tab) => tab.paperId !== paperId);
      const activeView =
        old.activeView === `reader:${paperId}` && tabs.length > 0
          ? `reader:${tabs[tabs.length - 1].paperId}`
          : old.activeView === `reader:${paperId}`
            ? 'library'
            : old.activeView;
      return { readerTabs: tabs, activeView };
    });
  }, []);

  const moveReaderTab = useCallback((from: number, to: number) => {
    setUiState((old) => {
      if (from === to || from < 0 || to < 0 || from >= old.readerTabs.length || to >= old.readerTabs.length) {
        return old;
      }
      const tabs = [...old.readerTabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(to, 0, moved);
      return { ...old, readerTabs: tabs };
    });
  }, []);

  const activateView = useCallback((view: string) => {
    setUiState((old) => ({ ...old, activeView: view }));
  }, []);

  // Handle note back-jump: openToshould paper   Reader tab and note target annotation. 
  useEffect(() => {
    const paperParam = searchParams.get('paper');
    if (!paperParam) return;
    const paperId = Number(paperParam);
    if (!Number.isFinite(paperId)) return;
    const annParam = searchParams.get('ann');
    const annId = annParam !== null && Number.isFinite(Number(annParam)) ? Number(annParam) : null;

    setUiState((old) => {
      const exists = old.readerTabs.some((tab) => tab.paperId === paperId);
      // Title unknown yet, Placeholder first; ReaderView After load tab will beRealTitleoverwrite. 
      const tabs = exists ? old.readerTabs : [...old.readerTabs, { paperId, title: `#${paperId}` }];
      return { readerTabs: tabs, activeView: `reader:${paperId}` };
    });
    setFocusAnnotationId(annId);

    const next = new URLSearchParams(searchParams);
    next.delete('paper');
    next.delete('ann');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const api = useMemo<LiteratureApi>(
    () => ({
      activeView: uiState.activeView,
      readerTabs: uiState.readerTabs,
      searchTerm,
      setSearchTerm,
      searchFocusTick,
      openReader,
      closeReaderTab,
      moveReaderTab,
      openLibrary: () => activateView('library'),
      openExtraction: (paperId?: number) => {
        if (paperId !== undefined) setExtractionPaperId(paperId);
        activateView('extraction');
      },
      openImport: (mode: ImportMode) => setImportMode(mode),
      openNewCollection: () => setNewCollectionOpen(true),
      focusSearch: () => setSearchFocusTick((tick) => tick + 1),
      extractionPaperId
    }),
    [uiState, searchTerm, searchFocusTick, openReader, closeReaderTab, moveReaderTab, activateView, extractionPaperId]
  );

  // Command Palette Action Wiring(Outside Module -> In-module)
  useEffect(() => {
    const handler = (action: { type: string }) => {
      if (action.type === 'import-pdf') setImportMode('pdf');
      else if (action.type === 'new-collection') setNewCollectionOpen(true);
      else if (action.type === 'focus-search') {
        activateView('library');
        setSearchFocusTick((tick) => tick + 1);
      }
    };
    const unsubscribe = listenLiteratureAction(handler);
    const initial = consumeLiteratureAction();
    if (initial) handler(initial);
    return unsubscribe;
  }, [activateView]);

  // Tab Drag Sort
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const dragOverRef = useRef<number | null>(null);

  const activeView = uiState.activeView;
  const readerPaperId =
    activeView.startsWith('reader:') ? Number(activeView.slice('reader:'.length)) : null;

  return (
    <LiteratureContext.Provider value={api}>
      <div className="lit-root">
        <div className="lit-tabbar" role="tablist" aria-label="Literature viewCutChange">
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'library'}
            className={`lit-tab ${activeView === 'library' ? 'is-active' : ''}`}
            onClick={() => activateView('library')}
          >
            <Library size={13} aria-hidden="true" />
            <span>Library</span>
          </button>
          <span className="lit-tab-sep" aria-hidden="true" />
          {uiState.readerTabs.map((tab, index) => (
            <button
              key={tab.paperId}
              type="button"
              role="tab"
              draggable
              aria-selected={activeView === `reader:${tab.paperId}`}
              className={`lit-tab lit-tab-reader ${activeView === `reader:${tab.paperId}` ? 'is-active' : ''}`}
              onClick={() => activateView(`reader:${tab.paperId}`)}
              onDragStart={() => setDragIndex(index)}
              onDragOver={(event) => {
                event.preventDefault();
                dragOverRef.current = index;
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (dragIndex !== null && dragOverRef.current !== null) {
                  moveReaderTab(dragIndex, dragOverRef.current);
                }
                setDragIndex(null);
              }}
              onDragEnd={() => setDragIndex(null)}
              title={tab.title}
            >
              <FileText size={13} aria-hidden="true" />
              <span className="lit-tab-label">{tab.title}.pdf</span>
              <span
                role="button"
                tabIndex={0}
                aria-label={`close ${tab.title}`}
                className="lit-tab-close"
                onClick={(event) => {
                  event.stopPropagation();
                  closeReaderTab(tab.paperId);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.stopPropagation();
                    closeReaderTab(tab.paperId);
                  }
                }}
              >
                <X size={11} aria-hidden="true" />
              </span>
            </button>
          ))}
          <button
            type="button"
            role="tab"
            aria-selected={activeView === 'extraction'}
            className={`lit-tab lit-tab-right ${activeView === 'extraction' ? 'is-active' : ''}`}
            onClick={() => activateView('extraction')}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>AI Extraction</span>
          </button>
          <span className="lit-tabbar-spacer" />
          <span className="lit-tabbar-hint">
            <GripVertical size={12} aria-hidden="true" />
            Drag Reader Tab Sortable
          </span>
        </div>

        <div className="lit-content">
          {activeView === 'library' && (
            <LibraryView newCollectionOpen={newCollectionOpen} onNewCollectionClose={() => setNewCollectionOpen(false)} />
          )}
          {activeView === 'extraction' && <ExtractionView initialPaperId={extractionPaperId} />}
          {readerPaperId !== null && (
            <Suspense fallback={<div className="lit-loading">Load Reader...</div>}>
              <ReaderView key={readerPaperId} paperId={readerPaperId} focusAnnotationId={focusAnnotationId} />
            </Suspense>
          )}
        </div>

        {importMode !== null && <ImportDialog mode={importMode} onClose={() => setImportMode(null)} />}
      </div>
    </LiteratureContext.Provider>
  );
}
