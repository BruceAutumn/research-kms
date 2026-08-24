import { X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { deleteRuns, getErrorMessage, getSystemAbout, listLlmModels } from '../api/client';
import { useLlmStatusQuery } from '../hooks/useAiStatus';
import { COMMAND_PALETTE_SHORTCUTS } from './CommandPalette';
import { useShell } from './ShellContext';
import {
  readFontSizeMode,
  readThemeMode,
  writeFontSizeMode,
  writeThemeMode,
  type FontSizeMode,
  type ThemeMode
} from './theme';

interface SettingsDrawerProps {
  open: boolean;
  section?: string;
  onClose: () => void;
}

export default function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const { resetLayouts } = useShell();
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => readThemeMode());
  const [fontSize, setFontSize] = useState<FontSizeMode>(() => readFontSizeMode());
  const [cleanupStatus, setCleanupStatus] = useState('');
  const [cleanupBefore, setCleanupBefore] = useState('');
  const [cleanupMessage, setCleanupMessage] = useState('');
  const [cleanupError, setCleanupError] = useState('');
  const statusQuery = useLlmStatusQuery();
  const modelsQuery = useQuery({ queryKey: ['llm-models'], queryFn: listLlmModels, enabled: open });
  const aboutQuery = useQuery({ queryKey: ['system-about'], queryFn: getSystemAbout, enabled: open });

  if (!open) return null;

  const chooseTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    writeThemeMode(mode);
  };

  const chooseFontSize = (mode: FontSizeMode) => {
    setFontSize(mode);
    writeFontSizeMode(mode);
  };

  const clearRuns = async () => {
    setCleanupMessage('');
    setCleanupError('');
    try {
      const result = await deleteRuns({ status: cleanupStatus || undefined, before: cleanupBefore || undefined });
      setCleanupMessage(`Cleaned ${result.runsDeleted} run records / ${result.stepsDeleted} steps. `);
    } catch (err) {
      setCleanupError(getErrorMessage(err));
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="Settings">
        <div className="drawer-header">
          <span className="drawer-title">Settings</span>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} title="close" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">
          <section className="drawer-section">
            <h3 className="drawer-section-title">appearance</h3>
            <div className="setting-row">
              <div><div className="setting-row-label">Theme</div><div className="setting-row-desc">current: {themeMode === 'system' ? 'Follow System' : themeMode === 'light' ? 'Light' : 'Dark'}</div></div>
              <div className="settings-segment" role="group" aria-label="Theme">
                <button type="button" className={themeMode === 'light' ? 'is-active' : ''} onClick={() => chooseTheme('light')}>Light</button>
                <button type="button" className={themeMode === 'dark' ? 'is-active' : ''} onClick={() => chooseTheme('dark')}>Dark</button>
                <button type="button" className={themeMode === 'system' ? 'is-active' : ''} onClick={() => chooseTheme('system')}>Follow System</button>
              </div>
            </div>
            <div className="setting-row">
              <div><div className="setting-row-label">UI Font Size</div><div className="setting-row-desc">current: {fontSize === 'small' ? 'Small' : fontSize === 'large' ? 'Large' : 'in'}</div></div>
              <div className="settings-segment" role="group" aria-label="UI Font Size">
                <button type="button" className={fontSize === 'small' ? 'is-active' : ''} onClick={() => chooseFontSize('small')}>Small</button>
                <button type="button" className={fontSize === 'medium' ? 'is-active' : ''} onClick={() => chooseFontSize('medium')}>in</button>
                <button type="button" className={fontSize === 'large' ? 'is-active' : ''} onClick={() => chooseFontSize('large')}>Large</button>
              </div>
            </div>
            <div className="setting-row">
              <div><div className="setting-row-label">Layout</div><div className="setting-row-desc">Restore All Pane  Default Width</div></div>
              <button type="button" className="btn" onClick={resetLayouts}>Reset</button>
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">AI Model</h3>
            <div className="setting-row"><div><div className="setting-row-label">Run Mode</div><div className="setting-row-desc">{statusQuery.data?.mock ? 'MOCK_LLM' : 'Real Provider'}</div></div></div>
            <div className="setting-row"><div><div className="setting-row-label">Enabled Models</div><div className="setting-row-desc">{(modelsQuery.data || []).filter((model) => model.enabled).length}  </div></div></div>
            <button className="btn btn-primary" onClick={() => { onClose(); window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Manage Models</button>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">Data</h3>
            <div className="setting-row">
              <div><div className="setting-row-label">Clean AI Run Log</div><div className="setting-row-desc">Delete by status or before date run and step</div></div>
            </div>
            <div className="settings-inline-form">
              <select value={cleanupStatus} onChange={(event) => setCleanupStatus(event.target.value)}>
                <option value="">any state</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="PAUSED">PAUSED</option>
              </select>
              <input type="date" value={cleanupBefore} onChange={(event) => setCleanupBefore(event.target.value)} />
              <button type="button" className="btn btn-danger" disabled={!cleanupStatus && !cleanupBefore} onClick={() => void clearRuns()}>Clean</button>
            </div>
            {cleanupMessage && <div className="setting-row-desc">{cleanupMessage}</div>}
            {cleanupError && <div className="form-error">{cleanupError}</div>}
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">shortcut</h3>
            <div className="shortcut-list">
              {COMMAND_PALETTE_SHORTCUTS.map((shortcut) => (
                <div className="shortcut-row" key={`${shortcut.keys}-${shortcut.label}`}>
                  <span>{shortcut.label}</span>
                  <code>{shortcut.keys}</code>
                </div>
              ))}
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">About</h3>
            <div className="about-list">
              <div className="about-row"><span>version</span><code>{aboutQuery.data?.version || 'Loading'}</code></div>
              <div className="about-row"><span>Backend Health</span><code>{aboutQuery.data?.backendHealth || 'Loading'}</code></div>
              <div className="about-row"><span>Flyway current version</span><code>{aboutQuery.data?.flywayVersion || 'Loading'}</code></div>
              <div className="about-row"><span>MOCK_LLM</span><code>{aboutQuery.data ? String(aboutQuery.data.mockLlm) : 'Loading'}</code></div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
