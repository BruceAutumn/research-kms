import { useEffect, useMemo, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent, ReactNode, UIEvent, WheelEvent as ReactWheelEvent } from 'react';
// use legacy build, Compat Safari 17 not yet supported Promise.withResolvers browser. 
// If directly import pdfjs-dist mostNewstandard build, Safari will show blank page. 
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import { ChevronLeft, ChevronRight, Minus, Plus, RotateCw, Scaling } from 'lucide-react';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/** PDF Page coord normalized rect(For annotation storage and render convert) */
export interface PdfRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PdfHighlight {
  id: number;
  page: number;
  rects: PdfRect[];
  color: string;
  comment?: string;
}

export interface PdfSelection {
  text: string;
  page: number;
  rects: PdfRect[];
  /** Selected mouse position(Viewport Coord), For floating menu position */
  x?: number;
  y?: number;
}

export const HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: 'rgba(250, 204, 21, 0.38)',
  green: 'rgba(74, 222, 128, 0.38)',
  blue: 'rgba(96, 165, 250, 0.38)',
  pink: 'rgba(244, 114, 182, 0.38)',
  orange: 'rgba(251, 146, 60, 0.38)',
  purple: 'rgba(168, 85, 247, 0.38)'
};

/** Annotation color semantic class -- Color not pretty, is classify.  */
export const HIGHLIGHT_COLOR_LABELS: Record<string, string> = {
  yellow: 'normal',
  orange: 'method',
  blue: 'Conclusion',
  green: 'Data',
  purple: 'question',
  pink: 'Other'
};

interface PdfViewerProps {
  url: string;
  /** controlledPage Number(Reader Sidebar page jump / Annotation jump uses); Default self-managed by component */
  page?: number;
  /** Toolbar right action area(Reader put Ask AI / Highlight toggle etc) */
  actions?: ReactNode;
  highlights?: PdfHighlight[];
  /**
   * Annotation to locate on note back-jump id. Scroll on hit and do 2 Second pulse highlight. 
   * this is"Bidirectional Jump"return endPoint: before this PdfViewer no such entry at all. 
   */
  focusAnnotationId?: number | null;
  onHighlightClick?: (highlight: PdfHighlight) => void;
  onSelection?: (selection: PdfSelection | null) => void;
  /** pdf.js documentToobject(provide Reader Render Thumbnail / Directory) */
  onReady?: (pdf: PDFDocumentProxy) => void;
  /** currentPagefull text(provide Reader   Ask AI Context) */
  onPageText?: (page: number, text: string) => void;
  onPageChange?: (page: number) => void;
  onScaleChange?: (scale: number) => void;
  onRotationChange?: (rotation: number) => void;
  onError?: (message: string) => void;
}

export default function PdfViewer({
  url,
  page,
  actions,
  highlights,
  focusAnnotationId,
  onHighlightClick,
  onSelection,
  onReady,
  onPageText,
  onPageChange,
  onScaleChange,
  onRotationChange,
  onError
}: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<{ width: number; height: number; convertToPdfPoint: (x: number, y: number) => number[] } | null>(null);
  const baseWidthRef = useRef(0);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [internalPage, setInternalPage] = useState(1);
  const [scale, setScale] = useState(1.25);
  const [rotation, setRotation] = useState(0);
  const [error, setError] = useState('');
  const [pageSize, setPageSize] = useState({ width: 0, height: 0 });

  const focusedOverlayRef = useRef<HTMLButtonElement | null>(null);
  const [pulsing, setPulsing] = useState(false);

  const pageNumber = page !== undefined ? page : internalPage;
  const setPageNumber = (next: number) => {
    setInternalPage(next);
    onPageChange?.(next);
  };

  // ---- Load PDF(Reuse v1   pdf.js Load Logic) ----
  useEffect(() => {
    let cancelled = false;
    setError('');
    setPageNumber(1);
    const loadingTask = pdfjsLib.getDocument({ url });
    loadingTask.promise
      .then((loadedPdf) => {
        if (cancelled) return;
        setPdf(loadedPdf);
        onReady?.(loadedPdf);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
        onError?.(message);
      });
    return () => {
      cancelled = true;
      void loadingTask.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const pageNumberSafe = Math.min(pageNumber, pdf?.numPages || 1);

  // ---- Render current page: canvas + text layer(For selected text) ----
  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    renderTaskRef.current?.cancel();

    const run = async () => {
      try {
        const page: PDFPageProxy = await pdf.getPage(pageNumberSafe);
        if (cancelled) return;
        const viewport = page.getViewport({ scale, rotation });
        viewportRef.current = viewport;
        if (baseWidthRef.current === 0) {
          const base = page.getViewport({ scale: 1, rotation: 0 });
          baseWidthRef.current = base.width;
        }
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        setPageSize({ width: viewport.width, height: viewport.height });
        const renderTask = page.render({ canvas, viewport });
        renderTaskRef.current = renderTask;
        await renderTask.promise;
        if (cancelled) return;

        // text layer: Let user select text
        const textLayerDiv = textLayerRef.current;
        if (textLayerDiv) {
          textLayerDiv.innerHTML = '';
          textLayerDiv.style.width = `${viewport.width}px`;
          textLayerDiv.style.height = `${viewport.height}px`;
          textLayerDiv.style.setProperty('--scale-factor', String(viewport.scale));
          const textContent = await page.getTextContent();
          if (cancelled) return;
          const textLayer = new pdfjsLib.TextLayer({
            textContentSource: textContent,
            container: textLayerDiv,
            viewport
          });
          await textLayer.render();
          if (!cancelled && onPageText) {
            const text = (textContent.items || [])
              .map((item) => ('str' in item ? item.str : ''))
              .join(' ')
              .replace(/\s+/g, ' ');
            onPageText(pageNumberSafe, text);
          }
        }
      } catch (err) {
        if (!cancelled && err instanceof Error && !String(err).includes('cancel')) {
          setError(err.message);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdf, pageNumberSafe, scale, rotation]);

  // ---- Selected Text -> Normalized Rect(PDF Page Coord) ----
  const handleMouseUp = (event: ReactMouseEvent) => {
    if (!onSelection) return;
    const selection = window.getSelection();
    const textLayerDiv = textLayerRef.current;
    const viewport = viewportRef.current;
    if (!selection || selection.isCollapsed || !textLayerDiv || !viewport) {
      return;
    }
    const text = selection.toString().trim();
    if (!text) return;
    if (!textLayerDiv.contains(selection.anchorNode)) return;
    const containerRect = textLayerDiv.getBoundingClientRect();
    const rects: PdfRect[] = [];
    for (let i = 0; i < selection.rangeCount; i += 1) {
      const range = selection.getRangeAt(i);
      const clientRects = range.getClientRects();
      for (const rect of Array.from(clientRects)) {
        if (rect.width < 1 && rect.height < 1) continue;
        const x = rect.left - containerRect.left;
        const y = rect.top - containerRect.top;
        const topLeft = viewport.convertToPdfPoint(x, y);
        const bottomRight = viewport.convertToPdfPoint(x + rect.width, y + rect.height);
        rects.push({
          x: topLeft[0],
          y: topLeft[1],
          w: bottomRight[0] - topLeft[0],
          h: bottomRight[1] - topLeft[1]
        });
      }
    }
    if (rects.length > 0) {
      onSelection({ text, page: pageNumberSafe, rects, x: event.clientX, y: event.clientY });
    }
  };

  const fitWidth = () => {
    const scrollWidth = scrollRef.current?.clientWidth || 800;
    if (baseWidthRef.current > 0) {
      const next = Math.max(0.3, (scrollWidth - 32) / baseWidthRef.current);
      setScale(next);
      onScaleChange?.(next);
    }
  };

  const changeScale = (next: number) => {
    setScale(next);
    onScaleChange?.(next);
  };

  const rotate = () => {
    const next = (rotation + 90) % 360;
    setRotation(next);
    onRotationChange?.(next);
  };

  const goToPage = (next: number) => {
    if (!pdf) return;
    const clamped = Math.max(1, Math.min(pdf.numPages, next));
    setPageNumber(clamped);
    onPageChange?.(clamped);
    scrollRef.current?.scrollTo({ top: 0 });
  };

  // Scroll bottom next page / Top scroll up prev page
  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    const el = event.currentTarget;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    const atTop = el.scrollTop <= 4;
    if (atBottom) {
      // Page only on scroll down
      el.dataset.atBottom = '1';
    } else {
      delete el.dataset.atBottom;
    }
    if (atTop) el.dataset.atTop = '1';
    else delete el.dataset.atTop;
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const el = scrollRef.current;
    if (!el || !pdf) return;
    if (event.deltaY > 0 && el.dataset.atBottom === '1') {
      goToPage(pageNumberSafe + 1);
    } else if (event.deltaY < 0 && el.dataset.atTop === '1') {
      goToPage(pageNumberSafe - 1);
    }
  };

  // back-jump locate: Scroll to target annotation after page render, and pulse 2 second. 
  // depend pageSize because overlay Coordinate needs page render first. 
  useEffect(() => {
    if (focusAnnotationId == null) {
      setPulsing(false);
      return;
    }
    const node = focusedOverlayRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPulsing(true);
    const timer = window.setTimeout(() => setPulsing(false), 2000);
    return () => window.clearTimeout(timer);
  }, [focusAnnotationId, pageNumberSafe, pageSize]);

  // use viewport Convert Render overlay(depend pageSize Trigger recompute)
  const overlays = useMemo(() => {
    const viewport = viewportRef.current;
    if (!viewport || !highlights) return [];
    const result: Array<{ key: string; isFocused: boolean; left: number; top: number; width: number; height: number; color: string; highlight: PdfHighlight }> = [];
    for (const h of highlights) {
      if (h.page !== pageNumberSafe) continue;
      for (let i = 0; i < h.rects.length; i += 1) {
        const rect = h.rects[i];
        const topLeft = viewport.convertToPdfPoint(rect.x, rect.y);
        const bottomRight = viewport.convertToPdfPoint(rect.x + rect.w, rect.y + rect.h);
        result.push({
          key: `${h.id}-${i}`,
          isFocused: focusAnnotationId != null && h.id === focusAnnotationId,
          left: topLeft[0],
          top: topLeft[1],
          width: bottomRight[0] - topLeft[0],
          height: bottomRight[1] - topLeft[1],
          color: HIGHLIGHT_COLORS[h.color] || HIGHLIGHT_COLORS.yellow,
          highlight: h
        });
      }
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlights, pageNumberSafe, pageSize, focusAnnotationId]);

  if (error) {
    return <div className="pdf-error">PDF Load failed: {error}</div>;
  }

  return (
    <div className="pdf-root">
      <div className="pdf-toolbar">
        <span className="pdf-toolbar-group">
          <button type="button" className="icon-btn" title="Prev Page" disabled={pageNumberSafe <= 1} onClick={() => goToPage(pageNumberSafe - 1)}>
            <ChevronLeft size={14} aria-hidden="true" />
          </button>
          <span className="pdf-page-input">
            <input
              value={pageNumberSafe}
              aria-label="Page Number"
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) goToPage(value);
              }}
            />
            <span>/ {pdf?.numPages || '--'}</span>
          </span>
          <button type="button" className="icon-btn" title="Next Page" disabled={!pdf || pageNumberSafe >= pdf.numPages} onClick={() => goToPage(pageNumberSafe + 1)}>
            <ChevronRight size={14} aria-hidden="true" />
          </button>
        </span>
        <span className="pdf-toolbar-sep" />
        <span className="pdf-toolbar-group">
          <button type="button" className="icon-btn" title="Shrink" onClick={() => changeScale(Math.max(0.4, Math.round((scale - 0.15) * 100) / 100))}>
            <Minus size={14} aria-hidden="true" />
          </button>
          <span className="pdf-zoom-label">{Math.round(scale * 100)}%</span>
          <button type="button" className="icon-btn" title="putLarge" onClick={() => changeScale(Math.min(4, Math.round((scale + 0.15) * 100) / 100))}>
            <Plus size={14} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" title="fit width" onClick={fitWidth}>
            <Scaling size={14} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" title="rotate" onClick={rotate}>
            <RotateCw size={14} aria-hidden="true" />
          </button>
        </span>
        <span className="pdf-toolbar-spacer" />
        {actions}
      </div>
      <div
        className="pdf-scroll"
        ref={scrollRef}
        onScroll={handleScroll}
        onWheel={handleWheel}
        onMouseUp={handleMouseUp}
      >
        {pdf ? (
          <div className="pdf-page-wrap" ref={wrapRef} style={{ width: pageSize.width, height: pageSize.height }}>
            <canvas ref={canvasRef} className="pdf-canvas" />
            <div ref={textLayerRef} className="pdf-text-layer" />
            <div className="pdf-highlight-layer" aria-hidden="true">
              {overlays.map((overlay) => (
                <button
                  key={overlay.key}
                  ref={overlay.isFocused ? focusedOverlayRef : undefined}
                  type="button"
                  className={`pdf-highlight ${overlay.isFocused && pulsing ? 'is-focus-pulse' : ''}`}
                  style={{
                    left: overlay.left,
                    top: overlay.top,
                    width: overlay.width,
                    height: overlay.height,
                    background: overlay.color
                  }}
                  title={overlay.highlight.comment || overlay.highlight.color}
                  onClick={() => onHighlightClick?.(overlay.highlight)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="pdf-loading">Load PDF...</div>
        )}
      </div>
    </div>
  );
}
