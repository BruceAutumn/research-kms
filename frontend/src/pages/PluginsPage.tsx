import { useEffect, useState } from 'react';
import { getErrorMessage, listPlugins } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { PluginInfo } from '../types';

export default function PluginsPage() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    listPlugins().then(setPlugins).catch((err) => setError(getErrorMessage(err)));
  }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Plugins</h1>
        <p className="text-sm text-slate-500">v1 just hardcodedToggleList, no dynamicLoad, Plugin API or Marketplace. </p>
      </div>
      <StatusMessage error={error} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {plugins.map((plugin) => (
          <div key={plugin.id} className={`rounded-xl border bg-white p-4 shadow-sm ${plugin.enabled ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-semibold">{plugin.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{plugin.description}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-xs ${plugin.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {plugin.enabled ? 'Enabled' : 'Coming soon'}
              </span>
            </div>
            <div className="mt-4 text-xs text-slate-400">{plugin.builtin ? 'Builtin' : 'External'} . {plugin.id}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
