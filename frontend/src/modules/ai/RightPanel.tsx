import type { Agent, AgentRun, ToolInfo } from '../../types';
import type { AiContextRef } from './AiStudioContext';

interface Props {
  agent?: Agent | null;
  contextRefs: AiContextRef[];
  tools: ToolInfo[];
  runs: AgentRun[];
  onHistory: (run: AgentRun) => void;
}

export default function RightPanel({ agent, contextRefs, tools, runs, onHistory }: Props) {
  const enabled = new Set(agent?.tools || []);
  return (
    <aside className="ai2-right">
      <section><h3>Instructions</h3><p>{agent?.prompt || '选择 Agent 后显示系统提示词。'}</p></section>
      <section><h3>Context</h3>{contextRefs.length ? contextRefs.map((ref, index) => <span className="ai2-chip" key={index}>{ref.label || ref.path || ref.type}</span>) : <p>无上下文</p>}</section>
      <section><h3>Tools</h3>{tools.filter((tool) => enabled.has(tool.name)).map((tool) => <span className="ai2-chip" key={tool.name}>{tool.displayName}</span>)}</section>
      <section><h3>History</h3>{runs.slice(0, 10).map((run) => <button className="ai2-history" key={run.id} onClick={() => onHistory(run)}>#{run.id} · {run.status}</button>)}</section>
    </aside>
  );
}
