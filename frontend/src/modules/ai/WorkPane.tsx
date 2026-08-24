import { useState } from 'react';
import { Check, X, ShieldCheck } from 'lucide-react';
import StepCard from './StepCard';
import ErrorCard from './ErrorCard';
import DiffApprovalDialog from './DiffApprovalDialog';
import type { AgentRunStep } from '../../types';

interface Props {
  steps: AgentRunStep[];
  error?: Record<string, unknown> | null;
  runId?: number;
  onApprove?: (runId: number, allow: boolean, alwaysAllow: boolean) => Promise<void>;
}

export default function WorkPane({ steps, error, runId, onApprove }: Props) {
  const [resolving, setResolving] = useState<number | null>(null);
  const [useRichDialog, setUseRichDialog] = useState(true);
  // permission.required 是不可变事件；授权结果会作为后续事件追加，而不会回写旧 step。
  // 因此必须从末尾找“最近一次尚未被 granted/denied/终态截断的 WAITING”。
  let pendingPermission: AgentRunStep | undefined;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (['permission.granted', 'permission.denied', 'run.completed', 'run.failed'].includes(step.eventType)) break;
    if (step.eventType === 'permission.required' && step.status === 'WAITING') {
      pendingPermission = step;
      break;
    }
  }

  async function handleApprove(allow: boolean, alwaysAllow: boolean) {
    if (!runId || !onApprove || !pendingPermission) return;
    setResolving(pendingPermission.id ?? 0);
    try {
      await onApprove(runId, allow, alwaysAllow);
    } finally {
      setResolving(null);
    }
  }

  return (
    <div className="ai2-stream">
      {steps.length === 0 && !error && <div className="ai2-empty">运行 Work 后，步骤时间线会在这里实时展开。</div>}
      {steps.map((step) => <StepCard key={step.id || `${step.runId}-${step.stepOrder}-${step.eventType}`} step={step} />)}
      {pendingPermission && useRichDialog && (
        <DiffApprovalDialog
          key={pendingPermission.id ?? `${pendingPermission.runId}-${pendingPermission.stepOrder}`}
          step={pendingPermission}
          onApprove={handleApprove}
        />
      )}
      {pendingPermission && !useRichDialog && (
        <div className="ai2-permission-bar">
          <div className="ai2-permission-info">
            <ShieldCheck size={16} />
            <span>{pendingPermission.message || `Agent 请求执行写操作：${pendingPermission.toolName}`}</span>
          </div>
          <div className="ai2-permission-actions">
            <button
              className="btn btn-sm btn-primary"
              disabled={resolving !== null}
              onClick={() => handleApprove(true, false)}
            >
              <Check size={14} /> 允许
            </button>
            <button
              className="btn btn-sm btn-secondary"
              disabled={resolving !== null}
              onClick={() => handleApprove(true, true)}
            >
              <ShieldCheck size={14} /> 始终允许
            </button>
            <button
              className="btn btn-sm btn-danger"
              disabled={resolving !== null}
              onClick={() => handleApprove(false, false)}
            >
              <X size={14} /> 拒绝
            </button>
          </div>
        </div>
      )}
      {error && <ErrorCard error={error} />}
    </div>
  );
}
