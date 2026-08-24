import { useState } from 'react';
import { X } from 'lucide-react';
import { createCollection } from '../../api/client';
import { getErrorMessage } from '../../api/client';
import type { Collection } from '../../types';

interface NewCollectionDialogProps {
  collections: Collection[];
  onClose: () => void;
  onCreated: () => void;
}

interface FlatOption {
  collection: Collection;
  depth: number;
}

function flatten(collections: Collection[], parentId: number | null, depth: number): FlatOption[] {
  const result: FlatOption[] = [];
  const children = collections
    .filter((c) => (c.parentId ?? null) === parentId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  for (const child of children) {
    result.push({ collection: child, depth });
    result.push(...flatten(collections, child.id, depth + 1));
  }
  return result;
}

export default function NewCollectionDialog({ collections, onClose, onCreated }: NewCollectionDialogProps) {
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const options = flatten(collections, null, 0);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError('');
    try {
      await createCollection({ name: trimmed, parentId: parentId === '' ? null : parentId });
      onCreated();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-shell" role="dialog" aria-modal="true">
      <div className="dialog-overlay" onClick={onClose} />
      <div className="dialog">
        <div className="dialog-header">
          <span className="dialog-title">新建 Collection</span>
          <button type="button" className="icon-btn" aria-label="关闭" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="dialog-body">
          <div className="field">
            <span className="field-label">名称</span>
            <input
              className="field-input"
              autoFocus
              value={name}
              placeholder="例如：材料基因组"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void save();
                if (event.key === 'Escape') onClose();
              }}
            />
          </div>
          <div className="field">
            <span className="field-label">父 Collection（可选）</span>
            <select className="field-input" value={parentId} onChange={(event) => setParentId(event.target.value === '' ? '' : Number(event.target.value))}>
              <option value="">（顶层）</option>
              {options.map((option) => (
                <option key={option.collection.id} value={option.collection.id}>
                  {'　'.repeat(option.depth) + option.collection.name}
                </option>
              ))}
            </select>
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
        <div className="dialog-footer">
          <button type="button" className="btn" onClick={onClose}>取消</button>
          <button type="button" className="btn btn-primary" disabled={!name.trim() || saving} onClick={() => void save()}>
            创建
          </button>
        </div>
      </div>
    </div>
  );
}
