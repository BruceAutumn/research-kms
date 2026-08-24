import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, listPlugins } from '../api/client';
import type { PluginInfo } from '../types';

/**
 * Right Fixed Panel:AI Assistant Entry + Plugin List. 
 * Corresponds to product blueprint"Right AI / Plugin Sidebar". 
 */
export default function RightPanel() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listPlugins().then(setPlugins).catch((err) => setError(getErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-4 p-4">
      <div className="kms-sidebar-section">
        <div className="kms-sidebar-title">AI Assistant</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">let AI really operateYourVault:search, Reading, extract, Generate Note. </p>
        <Link className="kms-primary-button mt-3 w-full" to="/agents">open Agent Runner</Link>
        <Link className="kms-secondary-button mt-2 w-full" to="/chat">Enter Paper Q&A</Link>
      </div>

      <div className="kms-sidebar-section">
        <div className="kms-sidebar-title">Plugin</div>
        <div className="mt-2 space-y-2">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs">[puzzle]</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-800">{plugin.name}</div>
                <div className="truncate text-xs text-slate-500">{plugin.description}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${plugin.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {plugin.enabled ? 'open' : 'Pending'}
              </span>
            </div>
          ))}
          {plugins.length === 0 && <p className="text-sm text-slate-500">Load plugin list...</p>}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
