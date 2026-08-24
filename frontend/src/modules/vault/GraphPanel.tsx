import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import cytoscape from 'cytoscape';
import { Network, Search } from 'lucide-react';
import { getGlobalGraph, getLocalGraph } from '../../api/client';
import { useVault } from './VaultContext';
import type { GraphData } from '../../types';

/** 从 :root 取计算后的颜色（Cytoscape canvas 不吃 var()，运行时解析一次）。 */
function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/** 文件夹着色调色板：全部取自 :root 语义 token（禁止硬写 hex）。 */
const FOLDER_COLOR_VARS = ['--accent', '--success', '--warning', '--danger', '--accent-hover', '--text-secondary'];

function folderColor(folder: string): string {
  let hash = 0;
  for (const char of folder) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  const token = FOLDER_COLOR_VARS[Math.abs(hash) % FOLDER_COLOR_VARS.length];
  return cssVar(token, 'currentColor');
}

interface GraphPanelProps {
  currentPath: string | null;
}

/**
 * 关系图谱（Cytoscape.js）—— 分析工具，不是首页动画。
 * 节点 > 300 自动降级：关动画、grid 布局、隐藏标签。
 */
export default function GraphPanel({ currentPath }: GraphPanelProps) {
  const { requestOpen } = useVault();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const [mode, setMode] = useState<'local' | 'global'>('local');
  const [depth, setDepth] = useState(1);
  const [query, setQuery] = useState('');

  const globalQuery = useQuery({ queryKey: ['vault', 'graph', 'global'], queryFn: getGlobalGraph });
  const localQuery = useQuery({
    queryKey: ['vault', 'graph', 'local', currentPath, depth],
    queryFn: () => getLocalGraph(currentPath ?? '', depth),
    enabled: Boolean(currentPath)
  });

  const data: GraphData | undefined = mode === 'global' ? globalQuery.data : localQuery.data;
  const degraded = (data?.nodes.length ?? 0) > 300;

  const colors = useMemo(
    () => ({
      node: cssVar('--accent', 'currentColor'),
      text: cssVar('--text-primary', 'currentColor'),
      textSecondary: cssVar('--text-secondary', 'currentColor'),
      edge: cssVar('--border-strong', 'currentColor'),
      edgeMissing: cssVar('--text-tertiary', 'currentColor'),
      bg: cssVar('--bg-app', 'transparent')
    }),
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !data) return;
    if (cyRef.current) {
      cyRef.current.destroy();
      cyRef.current = null;
    }
    const elements: cytoscape.ElementDefinition[] = [
      ...data.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.label,
          inDegree: node.inDegree ?? 0,
          folder: node.folder ?? '',
          depth: node.depth ?? 0,
          resolved: node.resolved
        }
      })),
      ...data.edges.map((edge, index) => ({
        data: {
          id: `e${index}`,
          source: edge.source,
          target: edge.target,
          resolved: edge.resolved
        }
      }))
    ];
    const cy = cytoscape({
      container,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'background-color': (element: cytoscape.NodeSingular) =>
              element.data('resolved') ? folderColor(element.data('folder')) : colors.bg,
            'border-width': 2,
            'border-color': (element: cytoscape.NodeSingular) =>
              element.data('resolved') ? folderColor(element.data('folder')) : colors.edgeMissing,
            'border-style': 'solid',
            width: (element: cytoscape.NodeSingular) => Math.max(10, Math.min(40, 12 + (element.data('inDegree') ?? 0) * 4)),
            height: (element: cytoscape.NodeSingular) => Math.max(10, Math.min(40, 12 + (element.data('inDegree') ?? 0) * 4)),
            label: 'data(label)',
            'font-size': 9,
            color: colors.text,
            'text-valign': 'bottom',
            'text-halign': 'center',
            'text-margin-y': 4,
            'text-max-width': '80px',
            'text-wrap': 'ellipsis'
          }
        },
        {
          selector: 'node[label]',
          style: { label: degraded ? '' : 'data(label)' }
        },
        {
          selector: 'edge',
          style: {
            width: 1.2,
            'line-color': (element: cytoscape.EdgeSingular) => (element.data('resolved') ? colors.edge : colors.edgeMissing),
            'target-arrow-color': (element: cytoscape.EdgeSingular) => (element.data('resolved') ? colors.edge : colors.edgeMissing),
            'target-arrow-shape': 'triangle',
            'arrow-scale': 0.7,
            'line-style': (element: cytoscape.EdgeSingular) => (element.data('resolved') ? 'solid' : 'dashed')
          }
        }
      ],
      layout: degraded
        ? { name: 'grid', animate: false, fit: true, padding: 30 }
        : { name: 'cose', animate: true, animationDuration: 400, padding: 30, nodeRepulsion: () => 4000 }
    });
    cyRef.current = cy;

    cy.on('tap', 'node', (event) => {
      const id = event.target.id();
      if (id.startsWith('unresolved:')) {
        const title = id.slice('unresolved:'.length);
        requestOpen(title); // 未创建 → 提示创建
        return;
      }
      requestOpen(id);
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [data, degraded, colors, requestOpen]);

  // 搜索定位：聚焦匹配节点并高亮邻域
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !query.trim()) {
      cy?.elements().removeClass('dimmed');
      return;
    }
    const needle = query.trim().toLowerCase();
    cy.elements().removeClass('dimmed');
    const matched = cy.nodes().filter((node) => node.data('label').toLowerCase().includes(needle));
    if (matched.length > 0) {
      cy.elements().addClass('dimmed');
      matched.removeClass('dimmed').union(matched.closedNeighborhood()).removeClass('dimmed');
      cy.animate({ fit: { eles: matched, padding: 60 }, duration: 300 });
    }
  }, [query]);

  return (
    <div className="vault-graph">
      <div className="vault-graph-controls">
        <div className="vault-graph-modes">
          <button type="button" className={`vault-chip ${mode === 'local' ? 'is-active' : ''}`} onClick={() => setMode('local')}>
            Local
          </button>
          <button type="button" className={`vault-chip ${mode === 'global' ? 'is-active' : ''}`} onClick={() => setMode('global')}>
            Global
          </button>
          {mode === 'local' && (
            <select className="field-input vault-depth-select" value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
              <option value={1}>深度 1</option>
              <option value={2}>深度 2</option>
              <option value={3}>深度 3</option>
            </select>
          )}
        </div>
        <div className="lit-toolbar-search vault-graph-search">
          <Search size={12} />
          <input placeholder="搜索定位节点…" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
      </div>
      {data ? (
        <>
          <div className="vault-graph-stats">
            {data.stats.nodes} 节点 · {data.stats.edges} 边
            {degraded && <span className="vault-graph-degrade"> · 已自动降级（关动画/简化布局）</span>}
            {mode === 'local' && !currentPath && ' · 未打开笔记，请先选择一篇笔记'}
          </div>
          <div ref={containerRef} className="vault-graph-canvas" />
        </>
      ) : (
        <div className="vault-graph-empty">
          <Network size={24} />
          <p>{mode === 'global' ? '加载全库图谱…' : '打开一篇笔记后显示 Local Graph。'}</p>
        </div>
      )}
    </div>
  );
}
