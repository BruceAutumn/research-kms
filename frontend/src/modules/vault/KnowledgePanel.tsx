import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bot, GitBranch, Heading2, Link2, Link2Off, ListTree, Plus, RefreshCw, Save, Tags, Trash2
} from 'lucide-react';
import {
  createLinkFromMention, createVaultNote, getBacklinksByPath, getOutgoingByPath,
  getUnlinkedByPath, readNoteFile, saveNoteProperties
} from '../../api/client';
import { getErrorMessage } from '../../api/client';
import type { PropertyRow } from '../../types';
import { useVault } from './VaultContext';
import VaultAiPanel from './VaultAiPanel';

const GraphPanel = lazy(() => import('./GraphPanel'));

type PanelId = 'properties' | 'backlinks' | 'outgoing' | 'outline' | 'graph' | 'ai';

const PANELS: Array<{ id: PanelId; title: string; icon: typeof Tags }> = [
  { id: 'properties', title: 'Properties', icon: Tags },
  { id: 'backlinks', title: 'Backlinks', icon: Link2 },
  { id: 'outgoing', title: 'Outgoing Links', icon: GitBranch },
  { id: 'outline', title: 'Outline', icon: Heading2 },
  { id: 'graph', title: 'Graph', icon: ListTree },
  { id: 'ai', title: 'AI', icon: Bot }
];

/** 右栏 Knowledge Panel：图标 Tab 切换，不同时展开。 */
export default function KnowledgePanel() {
  const { activePath, activeContent, requestOpen, requestScroll, bumpProperties } = useVault();
  const [panel, setPanel] = useState<PanelId>('properties');
  const queryClient = useQueryClient();

  const fileQuery = useQuery({
    queryKey: ['vault', 'file', activePath],
    queryFn: () => readNoteFile(activePath ?? ''),
    enabled: Boolean(activePath)
  });
  const file = fileQuery.data;

  // 无笔记时给出空态
  if (!activePath) {
    return (
      <div className="vault-knowledge">
        <div className="vault-kp-tabs">
          {PANELS.map((item) => (
            <button key={item.id} type="button" className={`vault-kp-tab ${panel === item.id ? 'is-active' : ''}`}
              title={item.title} onClick={() => setPanel(item.id)}>
              <item.icon size={13} />
            </button>
          ))}
        </div>
        <div className="vault-kp-empty">打开一篇笔记后，这里显示 Properties / Backlinks / Outgoing / Outline / Graph / AI。</div>
      </div>
    );
  }

  return (
    <div className="vault-knowledge">
      <div className="vault-kp-tabs">
        {PANELS.map((item) => (
          <button key={item.id} type="button" className={`vault-kp-tab ${panel === item.id ? 'is-active' : ''}`}
            title={item.title} onClick={() => setPanel(item.id)}>
            <item.icon size={13} />
          </button>
        ))}
      </div>

      <div className="vault-kp-body">
        {panel === 'properties' && file && (
          <PropertiesPanel
            path={activePath}
            file={file}
            onSaved={() => {
              bumpProperties();
              void queryClient.invalidateQueries({ queryKey: ['vault', 'table'] });
              void queryClient.invalidateQueries({ queryKey: ['vault', 'file', activePath] });
            }}
          />
        )}
        {panel === 'backlinks' && <BacklinksPanel path={activePath} onChanged={() => void queryClient.invalidateQueries({ queryKey: ['vault', 'file', activePath] })} />}
        {panel === 'outgoing' && <OutgoingPanel path={activePath} />}
        {panel === 'outline' && <OutlinePanel path={activePath} content={activeContent} onJump={(line) => requestScroll(activePath, line)} />}
        {panel === 'graph' && (
          <Suspense fallback={<div className="vault-kp-empty">加载图谱…</div>}>
            <GraphPanel currentPath={activePath} />
          </Suspense>
        )}
        {panel === 'ai' && file && (
          <VaultAiPanel
            path={activePath}
            content={activeContent || file.content}
            properties={file.properties}
            frontmatterValid={file.frontmatterValid}
            onContentSaved={() => {
              bumpProperties();
              void queryClient.invalidateQueries({ queryKey: ['vault', 'file', activePath] });
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Properties

function toRows(properties: Record<string, unknown>): PropertyRow[] {
  return Object.entries(properties).map(([key, value]) => {
    let valueType: PropertyRow['valueType'] = 'text';
    if (typeof value === 'boolean') valueType = 'checkbox';
    else if (typeof value === 'number') valueType = 'number';
    else if (Array.isArray(value)) valueType = 'list';
    else if (typeof value === 'string' && value.startsWith('[[') && value.endsWith(']]')) valueType = 'link';
    else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) valueType = 'date';
    return { key, value, valueType };
  });
}

function PropertiesPanel({ path, file, onSaved }: {
  path: string;
  file: { properties: Record<string, unknown>; mtime: number; frontmatterValid: boolean };
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<PropertyRow[]>(() => toRows(file.properties));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [newKey, setNewKey] = useState('');

  useEffect(() => {
    setRows(toRows(file.properties));
    setError('');
    setInfo('');
  }, [file.properties, path]);

  function updateRow(index: number, patch: Partial<PropertyRow>) {
    setRows((prev) => prev.map((row, idx) => (idx === index ? { ...row, ...patch } : row)));
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== index));
  }

  function addRow() {
    const key = newKey.trim();
    if (!key) return;
    if (rows.some((row) => row.key === key)) {
      setError('属性名已存在。');
      return;
    }
    setRows((prev) => [...prev, { key, value: '', valueType: 'text' }]);
    setNewKey('');
  }

  function toPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};
    for (const row of rows) {
      if (row.valueType === 'checkbox') payload[row.key] = row.value === true;
      else if (row.valueType === 'number') {
        const num = Number(row.value);
        payload[row.key] = Number.isNaN(num) ? String(row.value) : num;
      } else if (row.valueType === 'list') {
        const items = String(row.value).split('\n').map((item) => item.trim()).filter(Boolean);
        payload[row.key] = items;
      } else payload[row.key] = String(row.value);
    }
    return payload;
  }

  async function save() {
    setBusy(true);
    setError('');
    try {
      await saveNoteProperties(path, toPayload(), file.mtime);
      setInfo('已写回 frontmatter。');
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-props">
      {!file.frontmatterValid && (
        <div className="vault-fm-banner">⚠ frontmatter 解析失败：请先在源码模式修复 YAML，再编辑 Properties（当前不会覆盖原文）。</div>
      )}
      <div className="vault-props-head">
        <span className="vault-kp-section-title">Properties（frontmatter）</span>
        <button type="button" className="btn btn-primary" disabled={busy || !file.frontmatterValid} onClick={() => void save()}>
          <Save size={12} /> {busy ? '保存中…' : '保存'}
        </button>
      </div>
      {error && <div className="vault-error">{error}</div>}
      {info && <div className="vault-ok">{info}</div>}
      <div className="vault-props-list">
        {rows.map((row, index) => (
          <div key={`${row.key}-${index}`} className="vault-prop-row">
            <input className="field-input vault-prop-key" value={row.key}
              onChange={(event) => updateRow(index, { key: event.target.value })} />
            <select className="field-input vault-prop-type" value={row.valueType}
              onChange={(event) => updateRow(index, { valueType: event.target.value as PropertyRow['valueType'] })}>
              <option value="text">text</option>
              <option value="number">number</option>
              <option value="date">date</option>
              <option value="list">list</option>
              <option value="checkbox">checkbox</option>
              <option value="link">link</option>
            </select>
            {row.valueType === 'checkbox' ? (
              <input type="checkbox" className="vault-prop-checkbox" checked={row.value === true}
                onChange={(event) => updateRow(index, { value: event.target.checked })} />
            ) : row.valueType === 'list' ? (
              <textarea className="field-input vault-prop-value" rows={2}
                value={Array.isArray(row.value) ? row.value.join('\n') : String(row.value ?? '')}
                placeholder="每行一个值"
                onChange={(event) => updateRow(index, { value: event.target.value.split('\n') })} />
            ) : (
              <input className="field-input vault-prop-value" type={row.valueType === 'number' ? 'number' : 'text'}
                value={String(row.value ?? '')}
                onChange={(event) => updateRow(index, { value: row.valueType === 'number' ? Number(event.target.value) : event.target.value })} />
            )}
            <button type="button" className="icon-btn" title="删除属性" onClick={() => removeRow(index)}>
              <Trash2 size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="vault-prop-add">
        <input className="field-input" placeholder="新属性名（如 paper / topic）" value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') addRow(); }} />
        <button type="button" className="btn" onClick={addRow}><Plus size={12} /> 添加</button>
      </div>
      <p className="vault-kp-hint">增删改都会同步写回 .md 的 YAML 块；解析失败时不会覆盖原始文本。</p>
    </div>
  );
}

// ---------------------------------------------------------------- Backlinks

function BacklinksPanel({ path, onChanged }: { path: string; onChanged: () => void }) {
  const { requestOpen } = useVault();
  const backlinksQuery = useQuery({ queryKey: ['vault', 'backlinks', path], queryFn: () => getBacklinksByPath(path) });
  const unlinkedQuery = useQuery({ queryKey: ['vault', 'unlinked', path], queryFn: () => getUnlinkedByPath(path) });
  const [busyPath, setBusyPath] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function createLink(sourcePath: string, targetTitle: string) {
    setBusyPath(sourcePath);
    setError('');
    try {
      await createLinkFromMention(sourcePath, targetTitle);
      onChanged();
      void backlinksQuery.refetch();
      void unlinkedQuery.refetch();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyPath(null);
    }
  }

  return (
    <div className="vault-backlinks">
      <div className="vault-kp-section-title">Linked mentions ({backlinksQuery.data?.length ?? 0})</div>
      {backlinksQuery.data?.map((row) => (
        <div key={row.path} className="vault-backlink-row">
          <button type="button" className="vault-backlink-title" onClick={() => requestOpen(row.path)}>{row.title}</button>
          <p className="vault-backlink-snippet">「{row.snippet}」</p>
        </div>
      ))}
      {backlinksQuery.data && backlinksQuery.data.length === 0 && <p className="vault-kp-hint">暂无 Linked mentions。</p>}

      <div className="vault-kp-section-title">Unlinked mentions ({unlinkedQuery.data?.length ?? 0})</div>
      {unlinkedQuery.data?.map((row) => (
        <div key={row.path} className="vault-backlink-row">
          <button type="button" className="vault-backlink-title" onClick={() => requestOpen(row.path)}>{row.title}</button>
          <p className="vault-backlink-snippet">「{row.snippet}」</p>
          <button type="button" className="btn vault-link-create-btn" disabled={busyPath === row.path}
            onClick={() => void createLink(row.path, path.split('/').pop()?.replace(/\.md$/i, '') ?? '')}>
            <Link2 size={12} /> 建立链接
          </button>
        </div>
      ))}
      {unlinkedQuery.data && unlinkedQuery.data.length === 0 && <p className="vault-kp-hint">暂无 Unlinked mentions（正文中出现但未用 [[]] 包裹的标题）。</p>}
      {error && <div className="vault-error">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Outgoing

function OutgoingPanel({ path }: { path: string }) {
  const { requestOpen, refreshTree, openNote } = useVault();
  const outgoingQuery = useQuery({ queryKey: ['vault', 'outgoing', path], queryFn: () => getOutgoingByPath(path) });
  const [busyTitle, setBusyTitle] = useState<string | null>(null);
  const [error, setError] = useState('');

  async function createMissing(targetTitle: string) {
    setBusyTitle(targetTitle);
    setError('');
    try {
      const parent = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
      const result = await createVaultNote(parent, targetTitle, `# ${targetTitle}\n`);
      refreshTree();
      openNote(result.path, result.title);
      void outgoingQuery.refetch();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusyTitle(null);
    }
  }

  return (
    <div className="vault-outgoing">
      <div className="vault-kp-section-title">Outgoing Links ({outgoingQuery.data?.length ?? 0})</div>
      {outgoingQuery.data?.map((row, index) => (
        <div key={index} className={`vault-outgoing-row ${row.resolved ? '' : 'is-missing'}`}>
          {row.resolved ? (
            <button type="button" className="vault-backlink-title" onClick={() => requestOpen(row.targetPath ?? row.targetTitle)}>
              {row.targetTitle}
            </button>
          ) : (
            <>
              <button type="button" className="vault-backlink-title is-missing" onClick={() => createMissing(row.targetTitle)}>
                <Link2Off size={11} /> {row.targetTitle}
              </button>
              <span className="vault-kp-hint">未创建 —— 点击创建该笔记</span>
              {busyTitle === row.targetTitle && <span className="vault-kp-hint">创建中…</span>}
            </>
          )}
          {row.alias && <span className="vault-kp-hint">别名：{row.alias}</span>}
        </div>
      ))}
      {outgoingQuery.data && outgoingQuery.data.length === 0 && <p className="vault-kp-hint">本篇没有出链。</p>}
      {error && <div className="vault-error">{error}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Outline

function OutlinePanel({ path, content, onJump }: { path: string; content: string; onJump: (line: number) => void }) {
  const headings = useMemo(() => {
    const result: Array<{ level: number; text: string; line: number }> = [];
    content.split('\n').forEach((line, index) => {
      const match = /^(#{1,6})\s+(.+)$/.exec(line);
      if (match) {
        result.push({ level: match[1].length, text: match[2].trim(), line: index + 1 });
      }
    });
    return result;
  }, [content]);

  return (
    <div className="vault-outline">
      <div className="vault-kp-section-title">Outline（正文标题）</div>
      {headings.length === 0 && <p className="vault-kp-hint">没有标题（用 # / ## / ### 书写）。</p>}
      {headings.map((heading, index) => (
        <button
          key={`${path}-${index}`}
          type="button"
          className="vault-outline-row"
          style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
          onClick={() => onJump(heading.line)}
        >
          {heading.text}
        </button>
      ))}
    </div>
  );
}
