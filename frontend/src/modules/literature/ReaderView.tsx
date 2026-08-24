import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  Copy,
  Highlighter,
  MessageCircleQuestion,
  MessageSquareText,
  PenLine
} from 'lucide-react';
import {
  createAnnotation,
  deleteAnnotation,
  getErrorMessage,
  getPaper,
  listAnnotations,
  markPaperOpened,
  paperFileUrl
} from '../../api/client';
import type { Annotation, Paper, PdfSelection } from '../../types';
import PdfViewer from '../../components/PdfViewer';
import { HIGHLIGHT_COLORS, HIGHLIGHT_COLOR_LABELS } from '../../components/PdfViewer';
import { Workspace, Pane, Handle } from '../../components/workspace/Workspace';
import PagesSidebar from './reader/PagesSidebar';
import RightPanel from './reader/RightPanel';
import type { AutoPrompt } from './reader/AiPanel';

interface ReaderViewProps {
  paperId: number;
  /** 从笔记回跳过来时要定位的标注 id（双向跳转的回程）。 */
  focusAnnotationId?: number | null;
}

export default function ReaderView({ paperId, focusAnnotationId }: ReaderViewProps) {
  const queryClient = useQueryClient();
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentPageText, setCurrentPageText] = useState('');
  const [selection, setSelection] = useState<PdfSelection | null>(null);
  const [highlightColor, setHighlightColor] = useState('yellow');
  const [commentTarget, setCommentTarget] = useState<PdfSelection | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [autoPrompt, setAutoPrompt] = useState<AutoPrompt | null>(null);
  const [notice, setNotice] = useState('');
  /** 回跳解析结果：null=无回跳请求；否则记录是否找到、以及为什么定位不了。 */
  const [jumpState, setJumpState] = useState<{ id: number; page: number | null; problem: string } | null>(null);

  const paperQuery = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => getPaper(paperId)
  });

  const annotationsQuery = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => listAnnotations(paperId)
  });

  // 打开 Reader 即记录「最近阅读」
  useEffect(() => {
    markPaperOpened(paperId)
      .then(() => queryClient.invalidateQueries({ queryKey: ['papers'] }))
      .catch(() => undefined);
  }, [paperId, queryClient]);

  const paper = paperQuery.data;

  const highlights = useMemo(
    () =>
      (annotationsQuery.data || []).map((annotation) => {
        let rects: Array<{ x: number; y: number; w: number; h: number }> = [];
        // 优先读 rectsJson（V9 起的字段），回退 position（legacy）。
        // 此前只读 position，导致只有 rectsJson 的标注在界面上完全渲染不出高亮框。
        try {
          const parsed = JSON.parse(annotation.rectsJson || annotation.position || '[]');
          if (Array.isArray(parsed)) rects = parsed;
        } catch {
          rects = [];
        }
        return {
          id: annotation.id,
          page: annotation.page,
          rects,
          color: annotation.color || 'yellow',
          comment: annotation.comment
        };
      }),
    [annotationsQuery.data]
  );

  /**
   * 回跳解析。三种结局都必须明确告诉用户，不许静默失败：
   *   1. 标注已被删除 -> 提示找不到
   *   2. 标注在但没有 rects（旧标注/坐标缺失）-> 跳到页码，明说「只能定位到页」
   *   3. 正常 -> 跳页 + 交给 PdfViewer 做脉冲高亮
   */
  useEffect(() => {
    if (focusAnnotationId == null) {
      setJumpState(null);
      return;
    }
    if (!annotationsQuery.data) return;
    const target = highlights.find((h) => h.id === focusAnnotationId);
    if (!target) {
      setJumpState({ id: focusAnnotationId, page: null, problem: '找不到这条标注（可能已被删除）。' });
      return;
    }
    setCurrentPage(target.page);
    setJumpState({
      id: focusAnnotationId,
      page: target.page,
      problem: target.rects.length === 0 ? `这条标注没有位置信息，只能定位到第 ${target.page} 页，无法高亮。` : ''
    });
  }, [focusAnnotationId, annotationsQuery.data, highlights]);

  function flashNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2000);
  }

  async function addHighlight(sel: PdfSelection, comment?: string) {
    try {
      await createAnnotation({
        paperId,
        page: sel.page,
        // 两个字段都写：只写 position 的话后端工具（ListAnnotationsTool、笔记导出）拿不到坐标；
        // 只写 rectsJson 的话 legacy 前端读不到。V9 加了列但没统一读写口径，这里收敛。
        position: JSON.stringify(sel.rects),
        rectsJson: JSON.stringify(sel.rects),
        selectedText: sel.text,
        color: highlightColor,
        comment
      });
      await queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      flashNotice('标注已保存');
    } catch (err) {
      flashNotice(`标注失败：${getErrorMessage(err)}`);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flashNotice('已复制到剪贴板');
    } catch {
      flashNotice('复制失败');
    }
  }

  function askAi(prompt: string) {
    setAutoPrompt({ text: prompt, ts: Date.now() });
  }

  const clearSelection = useCallback(() => {
    setSelection(null);
    setCommentTarget(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  useEffect(() => {
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') clearSelection();
    }
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [clearSelection]);

  if (paperQuery.isError) {
    return <div className="pdf-error">文献加载失败：{getErrorMessage(paperQuery.error)}</div>;
  }
  if (!paper) {
    return <div className="pdf-loading">加载文献…</div>;
  }

  const toolbarActions = (
    <span className="pdf-toolbar-group">
      <button
        type="button"
        className="btn"
        title="高亮标注：点击切换颜色"
        style={{ borderColor: HIGHLIGHT_COLORS[highlightColor] }}
        onClick={() => {
          const colors = Object.keys(HIGHLIGHT_COLORS);
          const next = colors[(colors.indexOf(highlightColor) + 1) % colors.length];
          setHighlightColor(next);
          flashNotice(`高亮颜色：${HIGHLIGHT_COLOR_LABELS[next] || next}`);
        }}
      >
        <Highlighter size={13} aria-hidden="true" />
        <span className="hl-swatch" style={{ background: HIGHLIGHT_COLORS[highlightColor] }} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-primary" onClick={() => setAutoPrompt({ text: '总结全文', ts: Date.now() })}>
        <MessageCircleQuestion size={13} aria-hidden="true" />
        Ask AI
      </button>
    </span>
  );

  return (
    <div className="reader-root">
      {notice && <div className="reader-notice">{notice}</div>}
      {/* 回跳失败必须看得见 —— 静默失败会让人以为「双向跳转做好了」。 */}
      {jumpState?.problem && (
        <div className="reader-notice is-warning">
          ↩ 回跳：{jumpState.problem}
          <button type="button" className="reader-notice-close" onClick={() => setJumpState(null)}>×</button>
        </div>
      )}
      <Workspace
        storageKey="kms.layout.reader"
        defaultLayout={[16, 58, 26]}
        minSizes={[10, 40, 14]}
        maxSizes={[24, undefined, 36]}
        responsive={{ collapseLeftBelow: 900 }}
      >
        <Pane stack title="Pages" shaded>
          <PagesSidebar
            pdf={pdf}
            currentPage={currentPage}
            annotations={annotationsQuery.data || []}
            onJumpToPage={(page) => setCurrentPage(page)}
            onDeleteAnnotation={async (id: number) => {
              await deleteAnnotation(id);
              await queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
            }}
          />
        </Pane>
        <Handle />
        <Pane stack title={paper.title}>
          <PdfViewer
            url={paperFileUrl(paperId)}
            page={currentPage}
            actions={toolbarActions}
            highlights={highlights}
            focusAnnotationId={jumpState && !jumpState.problem ? jumpState.id : null}
            onReady={setPdf}
            onPageChange={setCurrentPage}
            onPageText={(_page, text) => setCurrentPageText(text)}
            onSelection={setSelection}
          />
        </Pane>
        <Handle />
        <Pane stack title="Panel" shaded>
          <RightPanel
            paper={paper}
            currentPage={currentPage}
            currentPageText={currentPageText}
            selectionText={selection?.text || null}
            annotations={annotationsQuery.data || []}
            autoPrompt={autoPrompt}
            onAutoPromptDone={() => setAutoPrompt(null)}
          />
        </Pane>
      </Workspace>

      {/* 选中文字浮动菜单：高亮 / 批注 / 复制 / 问 AI */}
      {selection && !commentTarget && (
        <div
          className="sel-menu"
          style={{ left: (selection.x || 0) + 8, top: (selection.y || 0) + 12 }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => { void addHighlight(selection); clearSelection(); }}>
            <Highlighter size={13} aria-hidden="true" /> 高亮
          </button>
          <button type="button" role="menuitem" onClick={() => { setCommentTarget(selection); setCommentDraft(''); }}>
            <PenLine size={13} aria-hidden="true" /> 添加批注
          </button>
          <button type="button" role="menuitem" onClick={() => { void copyText(selection.text); clearSelection(); }}>
            <Copy size={13} aria-hidden="true" /> 复制
          </button>
          <button type="button" role="menuitem" onClick={() => { askAi('解释选中内容'); clearSelection(); }}>
            <MessageSquareText size={13} aria-hidden="true" /> 问 AI
          </button>
        </div>
      )}

      {/* 批注输入弹层 */}
      {commentTarget && (
        <div
          className="sel-menu sel-menu-comment"
          style={{ left: (commentTarget.x || 0) + 8, top: (commentTarget.y || 0) + 12 }}
        >
          <p className="sel-comment-label">为选中文字添加批注</p>
          <p className="sel-comment-quote">「{(commentTarget.text || '').slice(0, 80)}」</p>
          <input
            className="field-input"
            autoFocus
            placeholder="批注内容…"
            value={commentDraft}
            onChange={(event) => setCommentDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                void addHighlight(commentTarget, commentDraft.trim() || undefined);
                clearSelection();
              }
              if (event.key === 'Escape') clearSelection();
            }}
          />
          <div className="sel-comment-actions">
            <button type="button" className="btn" onClick={clearSelection}>取消</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void addHighlight(commentTarget, commentDraft.trim() || undefined);
                clearSelection();
              }}
            >
              保存
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
