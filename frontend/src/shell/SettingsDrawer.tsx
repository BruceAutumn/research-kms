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
      setCleanupMessage(`已清理 ${result.runsDeleted} 条运行记录 / ${result.stepsDeleted} 条步骤。`);
    } catch (err) {
      setCleanupError(getErrorMessage(err));
    }
  };

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label="设置">
        <div className="drawer-header">
          <span className="drawer-title">设置</span>
          <button type="button" className="icon-btn" style={{ marginLeft: 'auto' }} title="关闭" onClick={onClose}>
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">
          <section className="drawer-section">
            <h3 className="drawer-section-title">外观</h3>
            <div className="setting-row">
              <div><div className="setting-row-label">主题</div><div className="setting-row-desc">当前：{themeMode === 'system' ? '跟随系统' : themeMode === 'light' ? '浅色' : '深色'}</div></div>
              <div className="settings-segment" role="group" aria-label="主题">
                <button type="button" className={themeMode === 'light' ? 'is-active' : ''} onClick={() => chooseTheme('light')}>浅色</button>
                <button type="button" className={themeMode === 'dark' ? 'is-active' : ''} onClick={() => chooseTheme('dark')}>深色</button>
                <button type="button" className={themeMode === 'system' ? 'is-active' : ''} onClick={() => chooseTheme('system')}>跟随系统</button>
              </div>
            </div>
            <div className="setting-row">
              <div><div className="setting-row-label">界面字号</div><div className="setting-row-desc">当前：{fontSize === 'small' ? '小' : fontSize === 'large' ? '大' : '中'}</div></div>
              <div className="settings-segment" role="group" aria-label="界面字号">
                <button type="button" className={fontSize === 'small' ? 'is-active' : ''} onClick={() => chooseFontSize('small')}>小</button>
                <button type="button" className={fontSize === 'medium' ? 'is-active' : ''} onClick={() => chooseFontSize('medium')}>中</button>
                <button type="button" className={fontSize === 'large' ? 'is-active' : ''} onClick={() => chooseFontSize('large')}>大</button>
              </div>
            </div>
            <div className="setting-row">
              <div><div className="setting-row-label">布局</div><div className="setting-row-desc">恢复所有 Pane 的默认宽度</div></div>
              <button type="button" className="btn" onClick={resetLayouts}>重置</button>
            </div>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">AI 模型</h3>
            <div className="setting-row"><div><div className="setting-row-label">运行模式</div><div className="setting-row-desc">{statusQuery.data?.mock ? 'MOCK_LLM' : '真实 Provider'}</div></div></div>
            <div className="setting-row"><div><div className="setting-row-label">已启用模型</div><div className="setting-row-desc">{(modelsQuery.data || []).filter((model) => model.enabled).length} 个</div></div></div>
            <button className="btn btn-primary" onClick={() => { onClose(); window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}>管理模型</button>
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">数据</h3>
            <div className="setting-row">
              <div><div className="setting-row-label">清理 AI 运行记录</div><div className="setting-row-desc">按状态或早于某日期删除 run 与 step</div></div>
            </div>
            <div className="settings-inline-form">
              <select value={cleanupStatus} onChange={(event) => setCleanupStatus(event.target.value)}>
                <option value="">任意状态</option>
                <option value="RUNNING">RUNNING</option>
                <option value="COMPLETED">COMPLETED</option>
                <option value="FAILED">FAILED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="PAUSED">PAUSED</option>
              </select>
              <input type="date" value={cleanupBefore} onChange={(event) => setCleanupBefore(event.target.value)} />
              <button type="button" className="btn btn-danger" disabled={!cleanupStatus && !cleanupBefore} onClick={() => void clearRuns()}>清理</button>
            </div>
            {cleanupMessage && <div className="setting-row-desc">{cleanupMessage}</div>}
            {cleanupError && <div className="form-error">{cleanupError}</div>}
          </section>

          <section className="drawer-section">
            <h3 className="drawer-section-title">快捷键</h3>
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
            <h3 className="drawer-section-title">关于</h3>
            <div className="about-list">
              <div className="about-row"><span>版本号</span><code>{aboutQuery.data?.version || '加载中'}</code></div>
              <div className="about-row"><span>后端健康</span><code>{aboutQuery.data?.backendHealth || '加载中'}</code></div>
              <div className="about-row"><span>Flyway 当前版本</span><code>{aboutQuery.data?.flywayVersion || '加载中'}</code></div>
              <div className="about-row"><span>MOCK_LLM</span><code>{aboutQuery.data ? String(aboutQuery.data.mockLlm) : '加载中'}</code></div>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}
