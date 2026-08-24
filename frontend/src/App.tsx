import { Suspense, lazy, useMemo, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import GlobalHeader from './shell/GlobalHeader';
import PrimaryNav from './shell/PrimaryNav';
import CommandPalette from './shell/CommandPalette';
import { ShellContext } from './shell/ShellContext';
import type { ShellApi } from './shell/ShellContext';
import LiteratureModule from './modules/LiteratureModule';
import VaultModule from './modules/VaultModule';
import HomeModule from './modules/HomeModule';
import { ReaderChatProvider } from './modules/literature/reader/ReaderChatContext';

// legacy Page lazy loading: Avoid pdf.js / legacy.css relatedCodeinto main chunk(Phase 4 Packaging Requirements)
const HomePage = lazy(() => import('./pages/HomePage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const PaperDetailPage = lazy(() => import('./pages/PaperDetailPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const NotesPage = lazy(() => import('./pages/NotesPage'));
const NoteEditorPage = lazy(() => import('./pages/NoteEditorPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const PluginsPage = lazy(() => import('./pages/PluginsPage'));
const AiStudioModule = lazy(() => import('./modules/AiStudioModule'));
const SettingsDrawer = lazy(() => import('./shell/SettingsDrawer'));

function lazyPage(node: React.ReactNode) {
  return <Suspense fallback={<div className="kms-route-pane legacy-page">Load old page...</div>}>{node}</Suspense>;
}

/** Layout Persistence key prefix(with react-resizable-panels autoSaveId prefix, Double Insurance) */
const LAYOUT_KEY_PREFIXES = ['kms.layout.', 'react-resizable-panels:kms.layout.'];

function clearLayoutStorage() {
  const doomed: string[] = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && LAYOUT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      doomed.push(key);
    }
  }
  doomed.forEach((key) => localStorage.removeItem(key));
}

/** v1 Old Route -> legacy Keep Zone, Keep query string; :param use current route paramsReplace */
function LegacyRedirect({ to }: { to: string }) {
  const params = useParams();
  const location = useLocation();
  let path = to;
  for (const [key, value] of Object.entries(params)) {
    path = path.replace(`:${key}`, value ?? '');
  }
  return <Navigate to={path + location.search} replace />;
}

/** legacy Unified page container: Reuse v1   kms-route-pane Style System */
function LegacyLayout() {
  return (
    <div className="kms-route-pane legacy-page">
      <Outlet />
    </div>
  );
}

export default function App() {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<string | undefined>(undefined);
  const [layoutResetVersion, setLayoutResetVersion] = useState(0);

  const shell = useMemo<ShellApi>(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openSettings: (section?: string) => {
        setSettingsSection(section);
        setSettingsOpen(true);
      },
      resetLayouts: () => {
        clearLayoutStorage();
        setLayoutResetVersion((version) => version + 1);
      },
      layoutResetVersion
    }),
    [layoutResetVersion]
  );

  return (
    <ShellContext.Provider value={shell}>
      <ReaderChatProvider>
      <div className="app-root">
        <GlobalHeader />
        <div className="app-body">
          <PrimaryNav />
          <main className="app-main">
            <Routes>
              {/* v2 Three Modules(Phase 3/4/5 fillInternalfeature) */}
              <Route path="/" element={<HomeModule />} />
              <Route path="/literature" element={<LiteratureModule />} />
              <Route path="/ai" element={<Suspense fallback={<div className="kms-route-pane legacy-page">Load AI Studio...</div>}><AiStudioModule /></Suspense>} />
              <Route path="/vault" element={<VaultModule />} />
              <Route path="/settings/models" element={lazyPage(<SettingsPage />)} />

              {/* v1 Old Route -> legacy(Phase 6 Unified Delete) */}
              <Route path="/library" element={<LegacyRedirect to="/legacy/library" />} />
              <Route path="/papers/:id" element={<LegacyRedirect to="/legacy/papers/:id" />} />
              <Route path="/chat" element={<LegacyRedirect to="/legacy/qa" />} />
              <Route path="/notes" element={<LegacyRedirect to="/legacy/notes" />} />
              <Route path="/notes/new" element={<LegacyRedirect to="/legacy/notes/new" />} />
              <Route path="/notes/:id" element={<LegacyRedirect to="/legacy/notes/:id" />} />
              <Route path="/agents" element={<Navigate to="/ai" replace />} />
              <Route path="/settings" element={<Navigate to="/settings/models" replace />} />
              <Route path="/plugins" element={<LegacyRedirect to="/legacy/plugins" />} />

              {/* legacy Keep Zone: Old page mounted as-is, Top nav does not expose entry */}
              <Route path="/legacy" element={<LegacyLayout />}>
                <Route index element={<Navigate to="/legacy/home" replace />} />
                <Route path="home" element={lazyPage(<HomePage />)} />
                <Route path="library" element={lazyPage(<LibraryPage />)} />
                <Route path="papers/:id" element={lazyPage(<PaperDetailPage />)} />
                <Route path="qa" element={lazyPage(<ChatPage />)} />
                <Route path="notes" element={lazyPage(<NotesPage />)} />
                <Route path="notes/new" element={lazyPage(<NoteEditorPage />)} />
                <Route path="notes/:id" element={lazyPage(<NoteEditorPage />)} />
                <Route path="settings" element={lazyPage(<SettingsPage />)} />
                <Route path="plugins" element={lazyPage(<PluginsPage />)} />
              </Route>

              <Route path="*" element={<Navigate to="/literature" replace />} />
            </Routes>
          </main>
        </div>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        {settingsOpen && (
          <Suspense fallback={null}>
            <SettingsDrawer open={settingsOpen} section={settingsSection} onClose={() => setSettingsOpen(false)} />
          </Suspense>
        )}
      </div>
      </ReaderChatProvider>
    </ShellContext.Provider>
  );
}
