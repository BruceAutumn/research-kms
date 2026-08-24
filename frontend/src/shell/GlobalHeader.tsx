import { Search, Settings } from 'lucide-react';
import { useAiStatus } from '../hooks/useAiStatus';
import { useShell } from './ShellContext';
import type { AiState } from '../hooks/useAiStatus';
import InstallAppButton from './InstallAppButton';

const AI_LABEL: Record<AiState, string> = {
  checking: '检查中…',
  mock: '模拟模式',
  ready: 'AI 就绪',
  unset: '未配置'
};

export default function GlobalHeader() {
  const { openPalette, openSettings } = useShell();
  const state = useAiStatus();

  return (
    <header className="global-header">
      <div className="header-product">
        <span className="header-product-mark">K</span>
        <span>Research KMS</span>
      </div>

      <button type="button" className="header-search" onClick={openPalette} title="全局搜索（⌘K / Ctrl+K）">
        <Search size={13} aria-hidden="true" />
        <span>搜索文献、笔记、Agent…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="header-right">
        <InstallAppButton />
        <button
          type="button"
          className={`ai-status is-${state}`}
          title={state === 'mock' ? '后端以 MOCK_LLM=true 运行，AI 回复为模拟数据' : 'LLM 连接状态'}
          onClick={() => {
            if (state === 'unset') openSettings('ai');
          }}
        >
          <span className="ai-status-dot" aria-hidden="true" />
          <span>{AI_LABEL[state]}</span>
        </button>

        <button type="button" className="icon-btn" title="设置" onClick={() => openSettings()}>
          <Settings size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
