import { useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Link2,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Sparkles,
  Tag,
  Trash2,
  X
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPaperNote,
  getErrorMessage,
  getPaperMetadata,
  getRelatedPapers,
  listExtractions,
  replacePaperMetadata,
  updatePaper
} from '../../api/client';
import type { MetadataField, Paper } from '../../types';
import { useLiterature } from './LiteratureContext';
import { AI_STATUS_META } from './PaperTable';
import { GenerateNoteDialog } from './GenerateNoteDialog';

interface InlineEditProps {
  value: string;
  placeholder?: string;
  multiline?: boolean;
  onSave: (value: string) => Promise<void>;
}

/** 就地编辑：点击变输入框，失焦保存，Esc 取消。 */
function InlineEdit({ value, placeholder, multiline, onSave }: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  async function commit() {
    setEditing(false);
    if (draft !== value) {
      await onSave(draft);
    }
  }

  if (editing) {
    return multiline ? (
      <textarea
        ref={ref as React.RefObject<HTMLTextAreaElement>}
        className="field-input insp-edit"
        value={draft}
        rows={4}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    ) : (
      <input
        ref={ref as React.RefObject<HTMLInputElement>}
        className="field-input insp-edit"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') commit();
          if (event.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={`insp-editable ${value ? '' : 'is-empty'}`}
      title={`点击编辑${placeholder ? ` ${placeholder}` : ''}`}
      onClick={() => setEditing(true)}
    >
      {value || placeholder || '—'}
      <Pencil size={11} className="insp-edit-icon" aria-hidden="true" />
    </button>
  );
}

interface SectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function Section({ title, count, defaultOpen, actions, children }: SectionProps) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div className="insp-section">
      <button type="button" className="insp-section-head" onClick={() => setOpen(!open)}>
        {open ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />}
        <span>{title}</span>
        {count !== undefined && <span className="insp-count">{count}</span>}
        {actions && <span className="insp-section-actions">{actions}</span>}
      </button>
      {open && <div className="insp-section-body">{children}</div>}
    </div>
  );
}

interface InspectorPanelProps {
  paper: Paper | null;
  onPaperUpdated: () => void;
  onOpenReader: (paper: Paper) => void;
  onOpenExtraction: (paper: Paper) => void;
}

export default function InspectorPanel({ paper, onPaperUpdated, onOpenReader, onOpenExtraction }: InspectorPanelProps) {
  const { openExtraction } = useLiterature();
  const queryClient = useQueryClient();
  const [tagDraft, setTagDraft] = useState('');
  const [kvEditing, setKvEditing] = useState(false);
  const [kvDraft, setKvDraft] = useState<MetadataField[]>([]);
  const [kvSaving, setKvSaving] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteDialog, setShowNoteDialog] = useState(false);

  const extractionsQuery = useQuery({
    queryKey: ['extractions', paper?.id],
    queryFn: () => listExtractions(paper!.id),
    enabled: paper !== null
  });

  const relatedQuery = useQuery({
    queryKey: ['related', paper?.id],
    queryFn: () => getRelatedPapers(paper!.id),
    enabled: paper !== null
  });

  const metadataQuery = useQuery({
    queryKey: ['paperMetadata', paper?.id],
    queryFn: () => getPaperMetadata(paper!.id),
    enabled: paper !== null
  });

  useEffect(() => {
    setTagDraft('');
  }, [paper?.id]);

  if (!paper) {
    return (
      <div className="insp-empty">
        <p>未选择文献</p>
        <p className="insp-empty-hint">在 Papers 列表中选择一篇文献，这里显示详情与元数据。</p>
      </div>
    );
  }

  const currentPaper: Paper = paper;
  const patch = (fields: Partial<Paper>) => updatePaper(currentPaper.id, fields).then(() => onPaperUpdated());

  function flashNote(message: string) {
    setNote(message);
    window.setTimeout(() => setNote(''), 2500);
  }

  const aiMeta = AI_STATUS_META[currentPaper.aiStatus] || AI_STATUS_META.NOT_PROCESSED;
  const extractions = extractionsQuery.data || [];
  const mock = extractions.some((row) => row.modelUsed === 'mock');
  const metadataFields = metadataQuery.data || [];

  async function addTag() {
    const tag = tagDraft.trim();
    if (!tag) return;
    const tags = [...new Set([...(currentPaper.tags || []), tag])];
    await patch({ tags });
    setTagDraft('');
  }

  async function removeTag(tag: string) {
    await patch({ tags: (currentPaper.tags || []).filter((t) => t !== tag) });
  }

  return (
    <div className="insp">
      {note && <div className="insp-notice">{note}</div>}
      <Section title="Info" defaultOpen>
        <div className="insp-info">
          <div className="insp-field">
            <span className="insp-label">Title</span>
            <InlineEdit value={paper.title} onSave={(v) => patch({ title: v })} />
          </div>
          <div className="insp-field">
            <span className="insp-label">Authors</span>
            <InlineEdit value={paper.authors || ''} placeholder="未填写" onSave={(v) => patch({ authors: v })} />
          </div>
          <div className="insp-field-row">
            <div className="insp-field">
              <span className="insp-label">Year</span>
              <InlineEdit value={paper.year ? String(paper.year) : ''} placeholder="—" onSave={(v) => patch({ year: v.trim() ? Number(v) : undefined })} />
            </div>
            <div className="insp-field">
              <span className="insp-label">Volume</span>
              <InlineEdit value={paper.volume || ''} placeholder="—" onSave={(v) => patch({ volume: v })} />
            </div>
          </div>
          <div className="insp-field-row">
            <div className="insp-field">
              <span className="insp-label">Pages</span>
              <InlineEdit value={paper.pages || ''} placeholder="—" onSave={(v) => patch({ pages: v })} />
            </div>
            <div className="insp-field">
              <span className="insp-label">Journal</span>
              <InlineEdit value={paper.journal || ''} placeholder="—" onSave={(v) => patch({ journal: v })} />
            </div>
          </div>
          <div className="insp-field">
            <span className="insp-label">DOI</span>
            <InlineEdit value={paper.doi || ''} placeholder="—" onSave={(v) => patch({ doi: v })} />
          </div>
          <div className="insp-field">
            <span className="insp-label">URL</span>
            <InlineEdit value={paper.url || ''} placeholder="—" onSave={(v) => patch({ url: v })} />
          </div>
        </div>
      </Section>

      <Section title="Abstract" defaultOpen>
        <InlineEdit value={paper.abstract || ''} placeholder="暂无摘要，点击填写" multiline onSave={(v) => patch({ abstract: v })} />
      </Section>

      <Section title="Tags" count={(paper.tags || []).length} defaultOpen>
        <div className="insp-tags">
          {(paper.tags || []).map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
              <button type="button" aria-label={`删除标签 ${tag}`} onClick={() => removeTag(tag)}>
                <X size={10} aria-hidden="true" />
              </button>
            </span>
          ))}
          {paper.tags.length === 0 && <span className="insp-empty-hint">暂无标签</span>}
          <div className="insp-tag-input">
            <input
              className="field-input"
              placeholder="添加标签，回车确认"
              value={tagDraft}
              onChange={(event) => setTagDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') addTag();
              }}
            />
          </div>
        </div>
      </Section>

      <Section title="Attachments" defaultOpen>
        {paper.pdfPath ? (
          <button type="button" className="btn insp-attachment" onClick={() => onOpenReader(paper)}>
            <FileText size={13} aria-hidden="true" />
            <span className="insp-attachment-name">{paper.title}.pdf</span>
          </button>
        ) : (
          <p className="insp-empty-hint">无 PDF 附件（DOI / BibTeX 导入）</p>
        )}
      </Section>

      <Section title="Notes" defaultOpen>
        <div className="insp-notes">
          <button type="button" className="btn btn-primary" onClick={() => setShowNoteDialog(true)}>
            <NotebookPen size={13} aria-hidden="true" />
            生成笔记到 Vault
          </button>
          <p className="insp-empty-hint">点击生成笔记，自动关联到知识库 Vault</p>
        </div>
      </Section>

      <Section title="AI Metadata" defaultOpen>
        <div className="insp-ai">
          <div className="insp-ai-row">
            <span className="insp-label">状态</span>
            <span className={`ai-chip ${aiMeta.cls}`}>{aiMeta.label}</span>
          </div>
          {extractions.length > 0 && (
            <div className="insp-ai-row">
              <span className="insp-label">提取记录</span>
              <span>{extractions.length} 条</span>
            </div>
          )}
          {mock && <span className="mock-badge">模拟输出</span>}
          <button type="button" className="btn btn-primary insp-ai-btn" onClick={() => { openExtraction(paper.id); onOpenExtraction(paper); }}>
            <Sparkles size={13} aria-hidden="true" />
            查看 AI Extraction
          </button>
        </div>
      </Section>

      <Section title="AI Metadata · KV" count={metadataFields.length}
        actions={!kvEditing && metadataFields.length > 0 ? (
          <button type="button" className="icon-btn" title="编辑 KV 元数据" onClick={() => { setKvDraft(metadataFields); setKvEditing(true); }}>
            <Pencil size={11} aria-hidden="true" />
          </button>
        ) : undefined}
      >
        {kvEditing ? (
          <div className="insp-kv-edit">
            {kvDraft.map((field, index) => (
              <div key={index} className="insp-kv-edit-row">
                <input
                  className="field-input insp-kv-edit-key"
                  placeholder="字段名"
                  value={field.key}
                  onChange={(event) => {
                    const next = [...kvDraft];
                    next[index] = { ...next[index], key: event.target.value };
                    setKvDraft(next);
                  }}
                />
                <input
                  className="field-input insp-kv-edit-val"
                  placeholder="值"
                  value={field.value}
                  onChange={(event) => {
                    const next = [...kvDraft];
                    next[index] = { ...next[index], value: event.target.value };
                    setKvDraft(next);
                  }}
                />
                <button type="button" className="icon-btn" title="删除" onClick={() => setKvDraft(kvDraft.filter((_, i) => i !== index))}>
                  <Trash2 size={11} aria-hidden="true" />
                </button>
              </div>
            ))}
            <div className="insp-kv-edit-actions">
              <button type="button" className="btn" onClick={() => { setKvDraft([...kvDraft, { key: '', value: '' }]); }}>
                <Plus size={11} aria-hidden="true" /> 添加字段
              </button>
              <button type="button" className="btn" disabled={kvSaving} onClick={async () => {
                setKvSaving(true);
                try {
                  const result = await replacePaperMetadata(currentPaper.id, kvDraft.filter((f) => f.key.trim()));
                  await queryClient.invalidateQueries({ queryKey: ['paperMetadata', currentPaper.id] });
                  if (result.overwrittenKeys.length > 0) {
                    flashNote(`已保存，但检测到重复字段 ${result.overwrittenKeys.join('、')}，仅保留了最后一次填写的值。`);
                  } else {
                    flashNote('KV 元数据已保存');
                  }
                  setKvEditing(false);
                } catch (err) {
                  flashNote(`保存失败：${getErrorMessage(err)}`);
                } finally {
                  setKvSaving(false);
                }
              }}>
                <Save size={11} aria-hidden="true" /> {kvSaving ? '保存中…' : '保存'}
              </button>
              <button type="button" className="btn" onClick={() => setKvEditing(false)}>取消</button>
            </div>
          </div>
        ) : metadataFields.length === 0 ? (
          <div className="insp-kv-empty">
            <p className="insp-empty-hint">暂无 KV 元数据</p>
            <button type="button" className="btn" onClick={() => { setKvDraft([{ key: '', value: '' }]); setKvEditing(true); }}>
              <Plus size={11} aria-hidden="true" /> 添加自定义字段
            </button>
          </div>
        ) : (
          <div className="insp-kv">
            {metadataFields.map((field) => (
              <div key={field.key} className="insp-kv-row">
                <span className="insp-kv-key">{field.key}</span>
                <span className="insp-kv-value">{field.value}</span>
              </div>
            ))}
            <button type="button" className="btn insp-kv-add-btn" onClick={() => { setKvDraft([...metadataFields, { key: '', value: '' }]); setKvEditing(true); }}>
              <Plus size={11} aria-hidden="true" /> 添加字段
            </button>
          </div>
        )}
      </Section>

      <Section title="Related" count={relatedQuery.data?.length}>
        {relatedQuery.data && relatedQuery.data.length > 0 ? (
          <div className="insp-related">
            {relatedQuery.data.map((related) => (
              <button key={related.id} type="button" className="insp-related-item" onClick={() => onOpenReader(related)}>
                <Link2 size={12} aria-hidden="true" />
                <span className="insp-related-title">{related.title}</span>
                <span className="insp-related-year">{related.year ?? '—'}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="insp-empty-hint">同 Collection / 同标签的相关文献会显示在这里</p>
        )}
      </Section>
      {showNoteDialog && (
        <GenerateNoteDialog
          paperId={currentPaper.id}
          paperTitle={currentPaper.title}
          onClose={() => setShowNoteDialog(false)}
          onCreated={async () => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['vault', 'table'] }),
              queryClient.invalidateQueries({ queryKey: ['vault', 'tree'] })
            ]);
            flashNote('笔记已写入 Vault');
          }}
        />
      )}
    </div>
  );
}
