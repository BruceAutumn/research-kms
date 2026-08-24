import { useEffect, useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import type { MetadataField } from '../types';

// ------------------------------------------------------------------
// v1 usage(legacy PaperDetailPage): fields + onSave + onClose, 
// Per Item Accept/Edit/Reject afterWholeSave -- Behavior unchanged. 
// Phase 3 Extension(AI Extraction view): pass groups + onAcceptRow/onRejectRow/onEditRow, 
// Render"Field | Original | AI Extracted | Confidence | Action"Compare Table, 
// each immediatelyI.e.persist(Write first ai_extraction, Accept before keep metadata_snapshot snapshot). 
// ------------------------------------------------------------------

interface ReviewItem extends MetadataField {
  status: 'accepted' | 'rejected';
}

export interface ExtractionGroup {
  group: string;
  label: string;
  items: ExtractionRowData[];
}

export interface ExtractionRowData {
  id: number;
  field: string;
  originalValue: string | null | undefined;
  extractedValue: string | null | undefined;
  confidence: number | null | undefined;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED';
  userValue: string | null | undefined;
}

interface MetadataReviewPanelProps {
  // ---- legacy usage ----
  fields: MetadataField[];
  onSave: (accepted: MetadataField[]) => Promise<void>;
  onClose: () => void;
  // ---- Phase 3 Extension(Optional)----
  groups?: ExtractionGroup[];
  onAcceptRow?: (id: number) => Promise<void>;
  onRejectRow?: (id: number) => Promise<void>;
  onEditRow?: (id: number, userValue: string) => Promise<void>;
  onAcceptAll?: () => Promise<void>;
  showConfidence?: boolean;
  /** Lines being committed id(Disable corresponding button) */
  busyId?: number | null;
}

export default function MetadataReviewPanel({
  fields,
  onSave,
  onClose,
  groups,
  onAcceptRow,
  onRejectRow,
  onEditRow,
  onAcceptAll,
  showConfidence,
  busyId
}: MetadataReviewPanelProps) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');

  useEffect(() => {
    setItems(fields.map((field) => ({ ...field, status: 'accepted' })));
  }, [fields]);

  const acceptedCount = items.filter((item) => item.status === 'accepted').length;

  // ---------------- Phase 3 Compare Table Mode ----------------
  if (groups) {
    const unresolved = groups.flatMap((g) => g.items).filter((r) => r.status === 'PENDING' || r.status === 'EDITED');
    return (
      <div className="ext-panel">
        <div className="ext-panel-head">
          <div className="ext-panel-title">
            AI Extraction Result(Write after confirm Metadata)
          </div>
          {onAcceptAll && (
            <button type="button" className="btn btn-primary" disabled={unresolved.length === 0} onClick={() => void onAcceptAll()}>
              <Check size={13} aria-hidden="true" /> Accept All({unresolved.length})
            </button>
          )}
        </div>
        <p className="ext-panel-hint">
          Accept Write papers / paper_metadata and auto snapshot before change(Rollbackable); Reject only log, No DB write; Edit Keep AI Original value and record your correction. 
        </p>
        <div className="ext-table">
          <div className="ext-row ext-head">
            <span>Field</span>
            <span>Original</span>
            <span>AI Extracted</span>
            {showConfidence && <span>Confidence</span>}
            <span>Action</span>
          </div>
          {groups.map((group) => (
            <div key={group.group} className="ext-group">
              <div className="ext-group-title">{group.label}</div>
              {group.items.map((row) => {
                const isBusy = busyId === row.id;
                const value = row.status === 'EDITED' && row.userValue !== undefined ? row.userValue : row.extractedValue;
                return (
                  <div key={row.id} className={`ext-row is-${row.status.toLowerCase()}`}>
                    <span className="ext-field" title={row.field}>{row.field}</span>
                    <span className="ext-original" title={row.originalValue || ''}>{row.originalValue || '--'}</span>
                    <span className="ext-extracted" title={value || ''}>
                      {editingId === row.id ? (
                        <input
                          className="field-input ext-edit-input"
                          autoFocus
                          value={editDraft}
                          onChange={(event) => setEditDraft(event.target.value)}
                          onBlur={async () => {
                            setEditingId(null);
                            if (onEditRow && editDraft !== value) await onEditRow(row.id, editDraft);
                          }}
                          onKeyDown={async (event) => {
                            if (event.key === 'Enter') {
                              setEditingId(null);
                              if (onEditRow) await onEditRow(row.id, editDraft);
                            }
                            if (event.key === 'Escape') setEditingId(null);
                          }}
                        />
                      ) : (
                        <>
                          {value || '--'}
                          {row.status === 'EDITED' && <span className="ext-edited-badge">Edited</span>}
                          {row.status === 'ACCEPTED' && <span className="ext-status-badge is-accepted">alreadyWrite</span>}
                          {row.status === 'REJECTED' && <span className="ext-status-badge is-rejected">Rejected</span>}
                        </>
                      )}
                    </span>
                    {showConfidence && (
                      <span className="ext-confidence">
                        {row.confidence !== null && row.confidence !== undefined
                          ? `${Math.round(row.confidence * 100)}%`
                          : '--'}
                      </span>
                    )}
                    <span className="ext-actions">
                      <button
                        type="button"
                        className="ext-btn is-accept"
                        title="Accept: Write official Metadata(Auto snapshot)"
                        disabled={isBusy || row.status === 'ACCEPTED'}
                        onClick={() => void onAcceptRow?.(row.id)}
                      >
                        <Check size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="ext-btn"
                        title="Edit: Save Correction(Keep AI Original Value)"
                        disabled={isBusy}
                        onClick={() => {
                          setEditingId(row.id);
                          setEditDraft(value || '');
                        }}
                      >
                        <Pencil size={13} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="ext-btn is-reject"
                        title="Reject: only log, No DB write"
                        disabled={isBusy || row.status === 'REJECTED'}
                        onClick={() => void onRejectRow?.(row.id)}
                      >
                        <X size={13} aria-hidden="true" />
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
          {groups.every((g) => g.items.length === 0) && (
            <div className="ext-empty">not yetExtraction Result, Point"Run Extraction"start. </div>
          )}
        </div>
      </div>
    );
  }

  // ---------------- legacy mode(Behavior with v1 Exactly Same) ----------------
  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-indigo-950">AI Metadata Review</h3>
          <p className="text-sm text-indigo-700">Accept per item / Edit / reject;Only written to DB after bottom save click. </p>
        </div>
        <button className="text-sm text-slate-500 hover:text-slate-900" onClick={onClose}>close</button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className={`rounded-lg border bg-white p-3 ${item.status === 'rejected' ? 'opacity-50' : ''}`}>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="rounded border px-2 py-1 text-sm"
                value={item.key}
                onChange={(e) => setItems((old) => old.map((it, i) => (i === index ? { ...it, key: e.target.value } : it)))}
              />
              <input
                className="rounded border px-2 py-1 text-sm"
                value={item.value || ''}
                onChange={(e) => setItems((old) => old.map((it, i) => (i === index ? { ...it, value: e.target.value } : it)))}
              />
            </div>
            <div className="mt-2 flex gap-2">
              <button
                className={`rounded px-2 py-1 text-xs ${item.status === 'accepted' ? 'bg-emerald-600 text-white' : 'border'}`}
                onClick={() => setItems((old) => old.map((it, i) => (i === index ? { ...it, status: 'accepted' } : it)))}
              >
                accept / Edit
              </button>
              <button
                className={`rounded px-2 py-1 text-xs ${item.status === 'rejected' ? 'bg-slate-700 text-white' : 'border'}`}
                onClick={() => setItems((old) => old.map((it, i) => (i === index ? { ...it, status: 'rejected' } : it)))}
              >
                reject
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-sm text-indigo-800">willSave {acceptedCount} item</span>
        <button
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            await onSave(items.filter((item) => item.status === 'accepted').map(({ key, value }) => ({ key, value })));
            setSaving(false);
          }}
        >
          Save accepted items
        </button>
      </div>
    </div>
  );
}
