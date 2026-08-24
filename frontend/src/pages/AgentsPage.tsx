import { FormEvent, useEffect, useState } from 'react';
import { createAgent, deleteAgent, getErrorMessage, listAgents, listTools } from '../api/client';
import StatusMessage from '../components/StatusMessage';
import type { Agent, ToolInfo } from '../types';

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [toolOptions, setToolOptions] = useState<ToolInfo[]>([]);
  const [name, setName] = useState('文献阅读 Agent');
  const [model, setModel] = useState('');
  const [prompt, setPrompt] = useState('你是一位严谨的论文阅读助手。');
  const [tools, setTools] = useState<string[]>(['pdf-reader']);
  const [error, setError] = useState('');

  async function refresh() {
    setAgents(await listAgents());
  }

  useEffect(() => {
    Promise.all([refresh(), listTools().then(setToolOptions)]).catch((err) => setError(getErrorMessage(err)));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      await createAgent({ name, model, prompt, tools });
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Agents</h1>
        <p className="text-sm text-slate-500">配置自定义 Agent；运行入口已收敛到 AI Studio。</p>
      </div>

      <StatusMessage error={error} />
      <form className="grid gap-3 rounded-xl bg-white p-4 shadow-sm md:grid-cols-2" onSubmit={submit}>
        <label className="block text-sm">名称<input className="mt-1 w-full rounded border px-3 py-2" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block text-sm">模型<input className="mt-1 w-full rounded border px-3 py-2" value={model} onChange={(e) => setModel(e.target.value)} placeholder="可选" /></label>
        <label className="block text-sm md:col-span-2">提示词<textarea className="mt-1 h-24 w-full rounded border px-3 py-2" value={prompt} onChange={(e) => setPrompt(e.target.value)} /></label>
        <div className="md:col-span-2">
          <div className="mb-2 text-sm font-medium">工具</div>
          <div className="flex flex-wrap gap-3">
            {toolOptions.map((tool) => (
              <label key={tool.name} className="text-sm">
                <input type="checkbox" className="mr-1" checked={tools.includes(tool.name)} onChange={(e) => setTools((old) => e.target.checked ? [...old, tool.name] : old.filter((item) => item !== tool.name))} />
                {tool.displayName || tool.name}
              </label>
            ))}
          </div>
        </div>
        <button className="w-fit rounded bg-indigo-600 px-4 py-2 text-white">创建 Agent</button>
      </form>
      <div className="grid gap-3 md:grid-cols-2">
        {agents.map((agent) => (
          <div key={agent.id} className="rounded-xl bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="font-semibold">{agent.name}</h2>
                <p className="text-sm text-slate-500">{agent.model || '未指定模型'} · 通过下方 Runner 运行</p>
              </div>
              <button className="text-sm text-red-600" onClick={async () => { await deleteAgent(agent.id); await refresh(); }}>删除</button>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{agent.prompt}</p>
            <div className="mt-3 flex flex-wrap gap-2">{agent.tools.map((tool) => <span key={tool} className="rounded bg-slate-100 px-2 py-1 text-xs">{tool}</span>)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
