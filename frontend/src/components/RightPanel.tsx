import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage, listPlugins } from '../api/client';
import type { PluginInfo } from '../types';

/**
 * 右侧固定面板:AI 助手入口 + 插件列表。
 * 对应产品蓝图里的「右侧 AI / Plugin Sidebar」。
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
        <div className="kms-sidebar-title">AI 助手</div>
        <p className="mt-2 text-sm leading-6 text-slate-600">让 AI 真正操作你的知识库:搜索、阅读、抽取、生成笔记。</p>
        <Link className="kms-primary-button mt-3 w-full" to="/agents">打开 Agent Runner</Link>
        <Link className="kms-secondary-button mt-2 w-full" to="/chat">进入论文问答</Link>
      </div>

      <div className="kms-sidebar-section">
        <div className="kms-sidebar-title">插件</div>
        <div className="mt-2 space-y-2">
          {plugins.map((plugin) => (
            <div key={plugin.id} className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white/70 px-3 py-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs">🧩</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-800">{plugin.name}</div>
                <div className="truncate text-xs text-slate-500">{plugin.description}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-black ${plugin.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {plugin.enabled ? '开' : '待'}
              </span>
            </div>
          ))}
          {plugins.length === 0 && <p className="text-sm text-slate-500">加载插件列表…</p>}
        </div>
      </div>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
