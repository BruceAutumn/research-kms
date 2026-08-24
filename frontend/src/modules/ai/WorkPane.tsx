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
  const pendingPermission = steps.find(
    (s) => s.eventType === 'permission.required' && s.status === 'WAITING'
  );

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
      {steps.length === 0 && !error && <div className="ai2-empty">Run Work after, Step timeline unfolds here. </div>}
      {steps.map((step) => <StepCard key={step.id || `${step.runId}-${step.stepOrder}-${step.eventType}`} step={step} />)}
      {pendingPermission && useRichDialog && (
        <DiffApprovalDialog
          step={pendingPermission}
          onApprove={handleApprove}
        />
      )}
      {pendingPermission && !useRichDialog && (
        <div className="ai2-permission-bar">
          <div className="ai2-permission-info">
            <ShieldCheck size={16} />
            <span>{pendingPermission.message || `Agent Request write operation: ${pendingPermission.toolName}`}</span>
          </div>
          <div className="ai2-permission-actions">
            <button
              className="btn btn-sm btn-primary"
              disabled={resolving !== null}
              onClick={() => handleApprove(true, false)}
            >
              <Check size={14} /> allow
            </button>
            <button
              className="btn btn-sm btn-secondary"
              disabled={resolving !== null}
              onClick={() => handleApprove(true, true)}
            >
              <ShieldCheck size={14} /> Always Allow
            </button>
            <button
              className="btn btn-sm btn-danger"
              disabled={resolving !== null}
              onClick={() => handleApprove(false, false)}
            >
              <X size={14} /> reject
            </button>
          </div>
        </div>
      )}
      {error && <ErrorCard error={error} />}
    </div>
  );
}
