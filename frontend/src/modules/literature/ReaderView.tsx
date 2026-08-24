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
  markPaperOpened
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
  /** Annotation to locate on note back-jump id(Backward jump return).  */
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
  /** back-jump parse result: null=No Back-jump Request; else record found, and why cannot locate.  */
  const [jumpState, setJumpState] = useState<{ id: number; page: number | null; problem: string } | null>(null);

  const paperQuery = useQuery({
    queryKey: ['paper', paperId],
    queryFn: () => getPaper(paperId)
  });

  const annotationsQuery = useQuery({
    queryKey: ['annotations', paperId],
    queryFn: () => listAnnotations(paperId)
  });

  // open Reader I.e. log"Recently Read"
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
        // optimizeFirstRead rectsJson(V9 startingField), fall back position(legacy). 
        // before onlyRead position, causing only rectsJson  Annotationin UI fullyRendernot outHighlightframe. 
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
   * back-jump parse. All three outcomes must be told, disallow silentFailed: 
   *   1. Annotation deleted -> Hint not found
   *   2. Annotation exists but no rects(Old Annotation/Coordinate Missing)-> Jump to page, explicitly say"only locate toPage"
   *   3. normal -> Page Jump + hand to PdfViewer Do pulse highlight
   */
  useEffect(() => {
    if (focusAnnotationId == null) {
      setJumpState(null);
      return;
    }
    if (!annotationsQuery.data) return;
    const target = highlights.find((h) => h.id === focusAnnotationId);
    if (!target) {
      setJumpState({ id: focusAnnotationId, page: null, problem: 'Cannot find this annotation(May be deleted). ' });
      return;
    }
    setCurrentPage(target.page);
    setJumpState({
      id: focusAnnotationId,
      page: target.page,
      problem: target.rects.length === 0 ? `This annotation has no position, only locate to ${target.page} Page, cannotHighlight. ` : ''
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
        // twoFieldall write: only write position thenBackend Tool(ListAnnotationsTool, Note Export)Cannot get coordinate; 
        // only write rectsJson then legacy Frontend cannot read. V9 Added columns but no unified read/write, thisinconverge. 
        position: JSON.stringify(sel.rects),
        rectsJson: JSON.stringify(sel.rects),
        selectedText: sel.text,
        color: highlightColor,
        comment
      });
      await queryClient.invalidateQueries({ queryKey: ['annotations', paperId] });
      flashNotice('Annotation saved');
    } catch (err) {
      flashNotice(`Annotation failed: ${getErrorMessage(err)}`);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      flashNotice('Copied to clipboard');
    } catch {
      flashNotice('Copy failed');
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
    return <div className="pdf-error">Failed to load paper: {getErrorMessage(paperQuery.error)}</div>;
  }
  if (!paper) {
    return <div className="pdf-loading">Load Paper...</div>;
  }

  const toolbarActions = (
    <span className="pdf-toolbar-group">
      <button
        type="button"
        className="btn"
        title="Highlight Annotation: Click switch color"
        style={{ borderColor: HIGHLIGHT_COLORS[highlightColor] }}
        onClick={() => {
          const colors = Object.keys(HIGHLIGHT_COLORS);
          const next = colors[(colors.indexOf(highlightColor) + 1) % colors.length];
          setHighlightColor(next);
          flashNotice(`Highlight Color: ${HIGHLIGHT_COLOR_LABELS[next] || next}`);
        }}
      >
        <Highlighter size={13} aria-hidden="true" />
        <span className="hl-swatch" style={{ background: HIGHLIGHT_COLORS[highlightColor] }} aria-hidden="true" />
      </button>
      <button type="button" className="btn btn-primary" onClick={() => setAutoPrompt({ text: 'summarizeFull Text', ts: Date.now() })}>
        <MessageCircleQuestion size={13} aria-hidden="true" />
        Ask AI
      </button>
    </span>
  );

  return (
    <div className="reader-root">
      {notice && <div className="reader-notice">{notice}</div>}
      {/* back-jumpFailedMustvisible -- silentFailedwill make people think"Bidirectional jump ready".  */}
      {jumpState?.problem && (
        <div className="reader-notice is-warning">
          <- back-jump: {jumpState.problem}
          <button type="button" className="reader-notice-close" onClick={() => setJumpState(null)}>x</button>
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
            url={`/api/papers/${paperId}/file`}
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

      {/* Selected text floating menu: Highlight / Annotation / Copy / ask AI */}
      {selection && !commentTarget && (
        <div
          className="sel-menu"
          style={{ left: (selection.x || 0) + 8, top: (selection.y || 0) + 12 }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={() => { void addHighlight(selection); clearSelection(); }}>
            <Highlighter size={13} aria-hidden="true" /> Highlight
          </button>
          <button type="button" role="menuitem" onClick={() => { setCommentTarget(selection); setCommentDraft(''); }}>
            <PenLine size={13} aria-hidden="true" /> Add Annotation
          </button>
          <button type="button" role="menuitem" onClick={() => { void copyText(selection.text); clearSelection(); }}>
            <Copy size={13} aria-hidden="true" /> Copy
          </button>
          <button type="button" role="menuitem" onClick={() => { askAi('explainSelectedcontent'); clearSelection(); }}>
            <MessageSquareText size={13} aria-hidden="true" /> ask AI
          </button>
        </div>
      )}

      {/* Annotation input popup */}
      {commentTarget && (
        <div
          className="sel-menu sel-menu-comment"
          style={{ left: (commentTarget.x || 0) + 8, top: (commentTarget.y || 0) + 12 }}
        >
          <p className="sel-comment-label">Add annotation to selected text</p>
          <p className="sel-comment-quote">"{(commentTarget.text || '').slice(0, 80)}"</p>
          <input
            className="field-input"
            autoFocus
            placeholder="Annotation Content..."
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
            <button type="button" className="btn" onClick={clearSelection}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                void addHighlight(commentTarget, commentDraft.trim() || undefined);
                clearSelection();
              }}
            >
              Save
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
