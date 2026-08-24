import { Search, Settings } from 'lucide-react';
import { useAiStatus } from '../hooks/useAiStatus';
import { useShell } from './ShellContext';
import type { AiState } from '../hooks/useAiStatus';

const AI_LABEL: Record<AiState, string> = {
  checking: 'Checking...',
  mock: 'Mock Mode',
  ready: 'AI ready',
  unset: 'Not Configured'
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

      <button type="button" className="header-search" onClick={openPalette} title="Global Search(CmdK / Ctrl+K)">
        <Search size={13} aria-hidden="true" />
        <span>Search Papers, Note, Agent...</span>
        <span className="kbd">CmdK</span>
      </button>

      <div className="header-right">
        <button
          type="button"
          className={`ai-status is-${state}`}
          title={state === 'mock' ? 'Backend with MOCK_LLM=true Run, AI Reply is mock data' : 'LLM connection status'}
          onClick={() => {
            if (state === 'unset') openSettings('ai');
          }}
        >
          <span className="ai-status-dot" aria-hidden="true" />
          <span>{AI_LABEL[state]}</span>
        </button>

        <button type="button" className="icon-btn" title="Settings" onClick={() => openSettings()}>
          <Settings size={15} aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
