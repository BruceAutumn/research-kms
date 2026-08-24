import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import {
  AlignLeft,
  FileText,
  Highlighter,
  Image as ImageIcon,
  Trash2
} from 'lucide-react';
import type { Annotation } from '../../../types';

export type SidebarTab = 'thumbnails' | 'outline' | 'annotations';

interface PagesSidebarProps {
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  annotations: Annotation[];
  onJumpToPage: (page: number) => void;
  onDeleteAnnotation: (id: number) => void;
}

interface OutlineItem {
  title: string;
  page: number | null;
  children: OutlineItem[];
}

export default function PagesSidebar({
  pdf,
  currentPage,
  annotations,
  onJumpToPage,
  onDeleteAnnotation
}: PagesSidebarProps) {
  const [tab, setTab] = useState<SidebarTab>('thumbnails');
  const [outline, setOutline] = useState<OutlineItem[]>([]);
  const [outlineLoading, setOutlineLoading] = useState(false);

  useEffect(() => {
    if (!pdf) return;
    let cancelled = false;
    setOutlineLoading(true);
    const resolveDest = async (dest: unknown): Promise<number | null> => {
      if (typeof dest === 'string') {
        try {
          dest = await pdf.getDestination(dest);
        } catch {
          return null;
        }
      }
      if (Array.isArray(dest) && dest[0] && typeof dest[0] === 'object') {
        try {
          return (await pdf.getPageIndex(dest[0] as never)) + 1;
        } catch {
          return null;
        }
      }
      return null;
    };
    const walk = async (items: Array<{ title: string; dest?: unknown; items?: Array<{ title: string; dest?: unknown; items?: unknown[] }> }>): Promise<OutlineItem[]> => {
      const result: OutlineItem[] = [];
      for (const item of items || []) {
        result.push({
          title: item.title || '(No Title)',
          page: await resolveDest(item.dest),
          children: await walk((item.items as never[]) || [])
        });
      }
      return result;
    };
    pdf
      .getOutline()
      .then(async (raw) => {
        if (cancelled) return;
        setOutline(await walk((raw as never[]) || []));
        setOutlineLoading(false);
      })
      .catch(() => {
        if (!cancelled) setOutlineLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pdf]);

  return (
    <div className="pages-sidebar">
      <div className="reader-subtabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'thumbnails'} className={`reader-subtab ${tab === 'thumbnails' ? 'is-active' : ''}`} onClick={() => setTab('thumbnails')} title="Thumbnail">
          <ImageIcon size={14} aria-hidden="true" />
        </button>
        <button type="button" role="tab" aria-selected={tab === 'outline'} className={`reader-subtab ${tab === 'outline' ? 'is-active' : ''}`} onClick={() => setTab('outline')} title="Directory">
          <AlignLeft size={14} aria-hidden="true" />
        </button>
        <button type="button" role="tab" aria-selected={tab === 'annotations'} className={`reader-subtab ${tab === 'annotations' ? 'is-active' : ''}`} onClick={() => setTab('annotations')} title="Annotation">
          <Highlighter size={14} aria-hidden="true" />
        </button>
      </div>

      {tab === 'thumbnails' && (
        <ThumbList pdf={pdf} currentPage={currentPage} onJumpToPage={onJumpToPage} />
      )}

      {tab === 'outline' && (
        <div className="outline-list">
          {outlineLoading && <p className="reader-hint">Load Dir...</p>}
          {!outlineLoading && outline.length === 0 && (
            <p className="reader-hint">this PDF noDirectory(outline)</p>
          )}
          {outline.map((item, index) => (
            <OutlineRow key={index} item={item} depth={0} currentPage={currentPage} onJumpToPage={onJumpToPage} />
          ))}
        </div>
      )}

      {tab === 'annotations' && (
        <div className="annotation-list">
          {annotations.length === 0 && (
            <p className="reader-hint">
              Selected PDF Floating menu appears after text: <br />
              Highlight / Annotation / Copy / ask AI
            </p>
          )}
          {annotations.map((annotation) => (
            <div key={annotation.id} className="annotation-item">
              <button type="button" className="annotation-main" onClick={() => onJumpToPage(annotation.page)}>
                <span className={`annotation-dot is-${annotation.color || 'yellow'}`} aria-hidden="true" />
                <span className="annotation-page">p.{annotation.page}</span>
                <span className="annotation-text">{(annotation.selectedText || annotation.comment || '').slice(0, 90)}</span>
              </button>
              {annotation.comment && <p className="annotation-comment">{annotation.comment}</p>}
              <button type="button" className="icon-btn annotation-delete" title="Delete Annotation" onClick={() => onDeleteAnnotation(annotation.id)}>
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutlineRow({
  item,
  depth,
  currentPage,
  onJumpToPage
}: {
  item: OutlineItem;
  depth: number;
  currentPage: number;
  onJumpToPage: (page: number) => void;
}) {
  const active = item.page !== null && item.page === currentPage;
  return (
    <div>
      <button
        type="button"
        className={`outline-row ${active ? 'is-active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        disabled={item.page === null}
        title={item.title}
        onClick={() => item.page !== null && onJumpToPage(item.page)}
      >
        {item.page !== null ? <span className="outline-page">{item.page}</span> : <FileText size={11} aria-hidden="true" />}
        <span className="outline-title">{item.title}</span>
      </button>
      {item.children.map((child, index) => (
        <OutlineRow key={index} item={child} depth={depth + 1} currentPage={currentPage} onJumpToPage={onJumpToPage} />
      ))}
    </div>
  );
}

const THUMB_HEIGHT = 168;

function ThumbList({
  pdf,
  currentPage,
  onJumpToPage
}: {
  pdf: PDFDocumentProxy | null;
  currentPage: number;
  onJumpToPage: (page: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(0);
  const numPages = pdf?.numPages || 0;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    setHeight(el.clientHeight);
    const onResize = () => setHeight(el.clientHeight);
    const observer = new ResizeObserver(onResize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  if (!pdf) {
    return <p className="reader-hint">PDF Loading...</p>;
  }

  const start = Math.max(0, Math.floor(scrollTop / THUMB_HEIGHT) - 2);
  const count = Math.ceil(height / THUMB_HEIGHT) + 4;
  const end = Math.min(numPages, start + count);

  return (
    <div
      className="thumb-list"
      ref={scrollRef}
      onScroll={(event) => setScrollTop((event.target as HTMLDivElement).scrollTop)}
    >
      <div style={{ height: numPages * THUMB_HEIGHT, position: 'relative' }}>
        {Array.from({ length: end - start }, (_, offset) => start + offset).map((pageIndex) => (
          <ThumbItem
            key={pageIndex}
            pdf={pdf}
            pageNumber={pageIndex + 1}
            top={pageIndex * THUMB_HEIGHT}
            active={pageIndex + 1 === currentPage}
            onJumpToPage={onJumpToPage}
          />
        ))}
      </div>
    </div>
  );
}

function ThumbItem({
  pdf,
  pageNumber,
  top,
  active,
  onJumpToPage
}: {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  top: number;
  active: boolean;
  onJumpToPage: (page: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (cancelled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1, rotation: 0 });
        const scale = Math.min(120 / base.width, 160 / base.height);
        const viewport = page.getViewport({ scale, rotation: 0 });
        const canvas = canvasRef.current;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvas, viewport }).promise;
      } catch {
        // Thumbnail render failure does not block main flow
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [pdf, pageNumber]);

  return (
    <button
      type="button"
      className={`thumb-item ${active ? 'is-active' : ''}`}
      style={{ top, height: THUMB_HEIGHT - 8 }}
      onClick={() => onJumpToPage(pageNumber)}
      title={`No. ${pageNumber} Page`}
    >
      <canvas ref={canvasRef} className="thumb-canvas" />
      <span className="thumb-page">{pageNumber}</span>
    </button>
  );
}
