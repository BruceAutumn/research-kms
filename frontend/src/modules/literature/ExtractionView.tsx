import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Sparkles } from 'lucide-react';
import {
  acceptAllExtractions,
  acceptExtraction,
  editExtraction,
  extractPaperMetadata,
  getErrorMessage,
  getPaper,
  listExtractions,
  listPapers,
  rejectExtraction
} from '../../api/client';
import type { AiExtractionRow, Paper } from '../../types';
import { Workspace, Pane, Handle } from '../../components/workspace/Workspace';
import MetadataReviewPanel from '../../components/MetadataReviewPanel';
import type { ExtractionGroup } from '../../components/MetadataReviewPanel';
import { AI_STATUS_META } from './PaperTable';
import { useLiterature } from './LiteratureContext';

const GROUP_LABELS: Record<string, string> = {
  metadata: 'Metadata',
  keywords: 'Keywords',
  abstract: 'Abstract',
  methods: 'Methods',
  materials: 'Materials',
  conditions: 'Experimental Conditions',
  results: 'Results',
  conclusions: 'Conclusions',
  custom: 'Custom Fields'
};

const GROUP_ORDER = ['metadata', 'keywords', 'abstract', 'materials', 'conditions', 'methods', 'results', 'conclusions', 'custom'];

interface ExtractionViewProps {
  initialPaperId?: number | null;
}

export default function ExtractionView({ initialPaperId }: ExtractionViewProps) {
  const queryClient = useQueryClient();
  const { openReader } = useLiterature();
  const [selectedId, setSelectedId] = useState<number | null>(initialPaperId ?? null);
  const [q, setQ] = useState('');
  const [running, setRunning] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const papersQuery = useQuery({
    queryKey: ['papers', 'all'],
    queryFn: () => listPapers()
  });

  const paperQuery = useQuery({
    queryKey: ['paper', selectedId],
    queryFn: () => getPaper(selectedId!),
    enabled: selectedId !== null
  });

  const extractionsQuery = useQuery({
    queryKey: ['extractions', selectedId],
    queryFn: () => listExtractions(selectedId!),
    enabled: selectedId !== null
  });

  const papers = useMemo(() => {
    const list = papersQuery.data || [];
    const query = q.trim().toLowerCase();
    return query
      ? list.filter((p) => p.title.toLowerCase().includes(query) || (p.authors || '').toLowerCase().includes(query))
      : list;
  }, [papersQuery.data, q]);

  const paper = paperQuery.data;

  useEffect(() => {
    if (initialPaperId !== undefined) {
      setSelectedId(initialPaperId);
      setError('');
    }
  }, [initialPaperId]);

  useEffect(() => {
    if (selectedId === null || !papersQuery.data) return;
    if (!papersQuery.data.some((item) => item.id === selectedId)) {
      setSelectedId(papersQuery.data[0]?.id ?? null);
      setError('');
    }
  }, [papersQuery.data, selectedId]);

  async function runExtract() {
    if (selectedId === null || running) return;
    setRunning(true);
    setError('');
    try {
      await extractPaperMetadata(selectedId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['extractions', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['paper', selectedId] }),
        queryClient.invalidateQueries({ queryKey: ['papers'] })
      ]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRunning(false);
    }
  }

  async function refresh() {
    if (selectedId === null) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['extractions', selectedId] }),
      queryClient.invalidateQueries({ queryKey: ['paper', selectedId] }),
      queryClient.invalidateQueries({ queryKey: ['papers'] })
    ]);
  }

  async function acceptRow(id: number) {
    setBusyId(id);
    try {
      await acceptExtraction(id);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function rejectRow(id: number) {
    setBusyId(id);
    try {
      await rejectExtraction(id);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function editRow(id: number, userValue: string) {
    setBusyId(id);
    try {
      await editExtraction(id, userValue);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function acceptAll() {
    if (selectedId === null) return;
    setBusyId(-1);
    try {
      await acceptAllExtractions(selectedId);
      await refresh();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  const groups = useMemo<ExtractionGroup[]>(() => {
    const rows = extractionsQuery.data || [];
    return GROUP_ORDER.map((group) => ({
      group,
      label: GROUP_LABELS[group] || group,
      items: rows
        .filter((row) => (row.fieldGroup || 'custom') === group)
        .map((row: AiExtractionRow) => ({
          id: row.id,
          field: row.field,
          originalValue: row.originalValue,
          extractedValue: row.extractedValue,
          confidence: row.confidence,
          status: row.status,
          userValue: row.userValue
        }))
    }));
  }, [extractionsQuery.data]);

  const mock = (extractionsQuery.data || []).some((row) => row.modelUsed === 'mock');
  const aiMeta = paper ? AI_STATUS_META[paper.aiStatus] || AI_STATUS_META.NOT_PROCESSED : null;

  return (
    <div className="lit-extraction">
      <Workspace
        storageKey="kms.layout.extraction"
        defaultLayout={[24, 76]}
        minSizes={[14, 50]}
        maxSizes={[34, undefined]}
        responsive={{ collapseLeftBelow: 900 }}
      >
        <Pane stack title="Papers" shaded>
          <div className="ext-paper-list">
            <div className="ext-paper-search">
              <Search size={12} aria-hidden="true" />
              <input
                placeholder="搜索文献…"
                value={q}
                onChange={(event) => setQ(event.target.value)}
              />
            </div>
            {papers.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`ext-paper-row ${selectedId === p.id ? 'is-active' : ''}`}
                onClick={() => {
                  setSelectedId(p.id);
                  setError('');
                }}
                onDoubleClick={() => openReader(p)}
                title={p.title}
              >
                <span className="ext-paper-title">{p.title}</span>
                <span className={`ai-chip ${(AI_STATUS_META[p.aiStatus] || AI_STATUS_META.NOT_PROCESSED).cls}`}>
                  {(AI_STATUS_META[p.aiStatus] || AI_STATUS_META.NOT_PROCESSED).label}
                </span>
              </button>
            ))}
            {papers.length === 0 && <p className="reader-hint">没有文献</p>}
          </div>
        </Pane>
        <Handle />
        <Pane stack title="AI Extraction">
          {selectedId === null ? (
            <div className="ext-empty-state">
              <Sparkles size={22} aria-hidden="true" />
              <p>选择左侧一篇文献，运行元数据提取</p>
              <p className="reader-hint">AI 结果先落 ai_extraction（PENDING），Accept / Edit / Reject 后才影响正式 Metadata。</p>
            </div>
          ) : (
            <div className="ext-main">
              <div className="ext-toolbar">
                <div className="ext-toolbar-info">
                  <span className="ext-paper-title-lg">{paper ? paper.title : '加载中…'}</span>
                  {aiMeta && <span className={`ai-chip ${aiMeta.cls}`}>{aiMeta.label}</span>}
                  {mock && <span className="mock-badge">模拟输出</span>}
                </div>
                <button type="button" className="btn btn-primary" disabled={running} onClick={() => void runExtract()}>
                  {running ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
                  {running ? '提取中…' : '运行提取'}
                </button>
              </div>
              {error && <p className="form-error">{error}</p>}
              <MetadataReviewPanel
                fields={[]}
                onSave={async () => undefined}
                onClose={() => undefined}
                groups={groups}
                onAcceptRow={(id) => acceptRow(id)}
                onRejectRow={(id) => rejectRow(id)}
                onEditRow={(id, userValue) => editRow(id, userValue)}
                onAcceptAll={() => acceptAll()}
                showConfidence
                busyId={busyId}
              />
            </div>
          )}
        </Pane>
      </Workspace>
    </div>
  );
}
