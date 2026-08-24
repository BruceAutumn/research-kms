import { useState } from 'react';
import { Check, CheckCheck, X, ShieldCheck, FileText, Tag, StickyNote } from 'lucide-react';
import type { AgentRunStep } from '../../types';

interface DiffEntry {
  target: string;
  targetId?: string;
  field: string;
  oldValue?: string;
  newValue?: string;
  action: 'update' | 'create' | 'delete' | 'add';
}

interface Props {
  step: AgentRunStep;
  onApprove: (allow: boolean, alwaysAllow: boolean) => Promise<void>;
}

function parseDiffEntries(step: AgentRunStep): DiffEntry[] {
  const input = step.input as Record<string, unknown> | undefined;
  if (!input) return [];
  const raw = input.diff || input.changes || input.entries;
  if (Array.isArray(raw)) {
    return raw as DiffEntry[];
  }
  if (step.message) {
    return [{
      target: step.toolName || 'operation',
      field: 'content',
      newValue: step.message,
      action: 'update'
    }];
  }
  return [];
}

function actionLabel(action: string): string {
  switch (action) {
    case 'create': return 'New';
    case 'delete': return 'Delete';
    case 'add': return 'Add';
    default: return 'Modify';
  }
}

function actionIcon(action: string) {
  switch (action) {
    case 'create': return <StickyNote size={13} />;
    case 'add': return <Tag size={13} />;
    case 'delete': return <X size={13} />;
    default: return <FileText size={13} />;
  }
}

export default function DiffApprovalDialog({ step, onApprove }: Props) {
  const [resolving, setResolving] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const entries = parseDiffEntries(step);
  const allSelected = selected.size === entries.length;

  function toggleSelect(index: number) {
    setSelected((old) => {
      const next = new Set(old);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(entries.map((_, i) => i)));
  }

  async function handleApprove(allow: boolean, alwaysAllow: boolean) {
    setResolving(true);
    try {
      await onApprove(allow, alwaysAllow);
    } finally {
      setResolving(false);
    }
  }

  const summary = step.message || `Agent Request write operation: ${step.toolName}`;

  return (
    <div className="diff-dialog-shell" role="dialog" aria-modal="true">
      <div className="diff-dialog-overlay" />
      <div className="diff-dialog">
        <div className="diff-dialog-header">
          <ShieldCheck size={16} aria-hidden="true" />
          <span className="diff-dialog-title">AI Request modify -- Please review</span>
        </div>

        <div className="diff-dialog-summary">
          <p>{summary}</p>
          {entries.length > 0 && (
            <p className="diff-dialog-count">
              total {entries.length} item change
            </p>
          )}
        </div>

        <div className="diff-dialog-body">
          {entries.length === 0 ? (
            <p className="diff-dialog-empty">No detailed change info. Please confirm to allow this action. </p>
          ) : (
            <>
              <div className="diff-dialog-toolbar">
                <button type="button" className="btn btn-sm" onClick={toggleAll}>
                  {allSelected ? 'Unselect All' : 'Select All'}
                </button>
                <span className="diff-dialog-selected">Selected {selected.size}/{entries.length}</span>
              </div>
              <div className="diff-dialog-list">
                {entries.map((entry, index) => (
                  <div
                    key={index}
                    className={`diff-entry ${selected.has(index) ? 'is-selected' : ''}`}
                    onClick={() => toggleSelect(index)}
                  >
                    <div className="diff-entry-header">
                      <span className="diff-entry-check">
                        {selected.has(index) ? <Check size={13} /> : <span className="diff-entry-unchecked" />}
                      </span>
                      {actionIcon(entry.action)}
                      <span className="diff-entry-action">{actionLabel(entry.action)}</span>
                      <span className="diff-entry-target">{entry.target}</span>
                      {entry.targetId && <span className="diff-entry-id">#{entry.targetId}</span>}
                      <span className="diff-entry-field">{entry.field}</span>
                    </div>
                    {entry.oldValue !== undefined && (
                      <div className="diff-line diff-line-old">
                        <span className="diff-line-sign">-</span>
                        <span className="diff-line-text">{entry.oldValue}</span>
                      </div>
                    )}
                    {entry.newValue !== undefined && (
                      <div className="diff-line diff-line-new">
                        <span className="diff-line-sign">+</span>
                        <span className="diff-line-text">{entry.newValue}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="diff-dialog-footer">
          <button
            type="button"
            className="btn btn-danger"
            disabled={resolving}
            onClick={() => handleApprove(false, false)}
          >
            <X size={14} /> reject
          </button>
          {entries.length > 0 && selected.size > 0 && selected.size < entries.length && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={resolving}
              onClick={() => handleApprove(true, false)}
            >
              <Check size={14} /> Accept Selected ({selected.size})
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            disabled={resolving}
            onClick={() => handleApprove(true, false)}
          >
            <CheckCheck size={14} /> Accept All
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={resolving}
            onClick={() => handleApprove(true, true)}
          >
            <ShieldCheck size={14} /> Always Allow
          </button>
        </div>
      </div>
    </div>
  );
}
