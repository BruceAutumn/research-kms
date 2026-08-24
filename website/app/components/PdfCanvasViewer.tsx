"use client";

import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

GlobalWorkerOptions.workerSrc = pdfWorker;

export type NormalizedRect = { x: number; y: number; width: number; height: number };
type DisplayAnnotation = { id: number; page: number; color: string; rects_json: string };

export function PdfCanvasViewer({ url, title, page, zoom, rotation, annotations, onPageCount, onAreaSelected }: {
  url: string;
  title: string;
  page: number;
  zoom: number;
  rotation: number;
  annotations: DisplayAnnotation[];
  onPageCount: (count: number) => void;
  onAreaSelected: (rect: NormalizedRect) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [status, setStatus] = useState("正在载入 PDF…");
  const [draft, setDraft] = useState<NormalizedRect | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    let active = true;
    const task = getDocument({ url, disableAutoFetch: false, disableStream: false });
    task.promise.then(document => {
      if (!active) return;
      setPdf(document);
      onPageCount(document.numPages);
      setStatus("");
    }).catch(() => active && setStatus("PDF 无法载入，请检查文件或重新上传。"));
    return () => { active = false; void task.destroy(); };
  }, [url, onPageCount]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !textLayerRef.current) return;
    let cancelled = false;
    let textLayer: TextLayer | null = null;
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null;
    void pdf.getPage(Math.min(Math.max(page, 1), pdf.numPages)).then(async pdfPage => {
      if (cancelled || !canvasRef.current || !textLayerRef.current) return;
      const viewport = pdfPage.getViewport({ scale: Math.max(.5, Math.min(2.5, zoom / 100)) * 1.35, rotation });
      const canvas = canvasRef.current;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      canvas.style.width = `${Math.ceil(viewport.width)}px`;
      canvas.style.height = `${Math.ceil(viewport.height)}px`;
      textLayerRef.current.replaceChildren();
      textLayerRef.current.style.width = canvas.style.width;
      textLayerRef.current.style.height = canvas.style.height;
      renderTask = pdfPage.render({ canvas, viewport });
      textLayer = new TextLayer({ textContentSource: await pdfPage.getTextContent(), container: textLayerRef.current, viewport });
      await Promise.all([renderTask.promise, textLayer.render()]);
    }).catch(error => {
      if (!cancelled && error?.name !== "RenderingCancelledException") setStatus("本页渲染失败，请重试。");
    });
    return () => { cancelled = true; renderTask?.cancel(); textLayer?.cancel(); };
  }, [pdf, page, zoom, rotation]);

  const begin = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.shiftKey || !pageRef.current) return;
    const rect = pageRef.current.getBoundingClientRect();
    originRef.current = { x: clamp((event.clientX - rect.left) / rect.width), y: clamp((event.clientY - rect.top) / rect.height) };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!originRef.current || !pageRef.current) return;
    const bounds = pageRef.current.getBoundingClientRect();
    const x = clamp((event.clientX - bounds.left) / bounds.width);
    const y = clamp((event.clientY - bounds.top) / bounds.height);
    setDraft(normalizeRect(originRef.current.x, originRef.current.y, x, y));
  };
  const end = () => {
    if (draft && draft.width > .01 && draft.height > .01) onAreaSelected(draft);
    originRef.current = null;
    setDraft(null);
  };

  const currentAnnotations = annotations.filter(item => item.page === page).flatMap(item => parseRects(item.rects_json).map(rect => ({ ...rect, id: item.id, color: item.color })));
  return <div className="pdf-canvas-scroll" aria-label={`${title} PDF 阅读器`}>
    {status && <div className="pdf-status" role="status">{status}</div>}
    <div className="pdf-page" ref={pageRef} onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end} title="可选择文字；按住 Shift 拖动可创建区域标注">
      <canvas ref={canvasRef} />
      <div className="textLayer" ref={textLayerRef} />
      <div className="pdf-selection-layer" aria-label="按住 Shift 拖动选择区域创建标注">
        {currentAnnotations.map((rect, index) => <span className={`pdf-annotation ${rect.color}`} key={`${rect.id}-${index}`} style={rectStyle(rect)} />)}
        {draft && <span className="pdf-annotation draft" style={rectStyle(draft)} />}
      </div>
    </div>
  </div>;
}

function normalizeRect(x1: number, y1: number, x2: number, y2: number): NormalizedRect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
}
function rectStyle(rect: NormalizedRect) { return { left: `${rect.x * 100}%`, top: `${rect.y * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }; }
function parseRects(value: string): NormalizedRect[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isRect).map(item => ({ x: clamp(item.x), y: clamp(item.y), width: clamp(item.width), height: clamp(item.height) })) : [];
  } catch { return []; }
}
function isRect(value: unknown): value is NormalizedRect {
  if (!value || typeof value !== "object") return false;
  const rect = value as Record<string, unknown>;
  return [rect.x, rect.y, rect.width, rect.height].every(item => typeof item === "number" && Number.isFinite(item));
}
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
