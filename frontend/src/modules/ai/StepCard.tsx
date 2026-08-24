import { AlertTriangle, CheckCircle2, Clock, Wrench } from 'lucide-react';
import type { AgentRunStep } from '../../types';

export default function StepCard({ step }: { step: AgentRunStep }) {
  const failed = step.status === 'FAILED' || step.eventType.includes('failed');
  const ok = step.status === 'COMPLETED';
  return (
    <div className={`ai2-step ${failed ? 'is-error' : ok ? 'is-ok' : 'is-running'}`}>
      <div className="ai2-step-icon">{failed ? <AlertTriangle size={16} /> : ok ? <CheckCircle2 size={16} /> : <Clock size={16} />}</div>
      <div className="ai2-step-body">
        <div className="ai2-step-head"><b>{step.toolName || step.eventType}</b><span>#{step.stepOrder}</span></div>
        <div className="ai2-step-msg">{step.message || step.error || step.status}</div>
        {(step.input && Object.keys(step.input).length > 0) && <details><summary><Wrench size={13} /> 参数</summary><pre>{JSON.stringify(step.input, null, 2)}</pre></details>}
      </div>
    </div>
  );
}
