import DOMPurify from 'dompurify';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { marked } from 'marked';
import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getNoteByTitle, vaultFileUrl } from '../api/client';

interface MarkdownPreviewProps {
  content: string;
  /**
   * Phase 4 Optional Extension(legacy Call behavior unchanged): 
   * - existingTitles: Vault Existing note title set inside, Not Created [[Link]] Show dashed underline
   * - onWikiLinkClick / onWikiLinkMissing: Vault Module handles backlink jump and create
   */
  existingTitles?: Set<string>;
  onWikiLinkClick?: (title: string) => void;
  onWikiLinkMissing?: (title: string) => void;
  className?: string;
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;
const AUDIO_EXT = /\.(mp3|wav|m4a|ogg|flac)$/i;
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i;
const PDF_EXT = /\.pdf$/i;

/**
 * Obsidian  File EmbedSyntax ![[File Name]] / ![[File Name|width]]. 
 *
 * Must run on renderWikiLinks before: otherwise ![[graph.png]] will be treated as normal backlink, 
 * Render as a link to"graph.png thisNote"dead link, Instead of showing graph. 
 *
 * Attachments stored in Attachments/(Same as upload endpoint); If dir already in syntax parse as-is. 
 */
const FILE_EMBED = /!\[\[([^\]|]+?)(?:\|(\d+))?\]\]/g;

function resolveAttachmentPath(name: string): string {
  const trimmed = name.trim();
  return trimmed.includes('/') ? trimmed : `Attachments/${trimmed}`;
}

function renderFileEmbeds(markdown: string): string {
  return markdown.replace(FILE_EMBED, (match, rawName: string, width?: string) => {
    const name = String(rawName).trim();
    const src = vaultFileUrl(resolveAttachmentPath(name));
    const sizeAttr = width ? ` width="${width}"` : '';
    if (IMAGE_EXT.test(name)) {
      return `<img class="md-embed md-embed-image" src="${src}" alt="${name}"${sizeAttr} loading="lazy" />`;
    }
    if (AUDIO_EXT.test(name)) {
      return `<audio class="md-embed md-embed-audio" controls src="${src}"></audio>`;
    }
    if (VIDEO_EXT.test(name)) {
      return `<video class="md-embed md-embed-video" controls src="${src}"${sizeAttr}></video>`;
    }
    if (PDF_EXT.test(name)) {
      return `<a class="md-embed md-embed-file" href="${src}" target="_blank" rel="noreferrer">[doc] ${name}</a>`;
    }
    // unknown type no guess, fall back to normal backlink to wiki-link logicProcess. 
    return match.slice(1);
  });
}

/**
 * Math. $$...$$ Block-level, $...$ Inline. 
 * in marked already beforeRenderinto HTML, Avoid Markdown   _ ^ * as strongCallSyntaxeat. 
 */
function renderMath(markdown: string): string {
  const render = (tex: string, displayMode: boolean) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode, throwOnError: false, output: 'html' });
    } catch {
      // Formula error should not fail whole note, Return as-is. 
      return displayMode ? `<pre class="md-math-error">$$${tex}$$</pre>` : `<code class="md-math-error">$${tex}$</code>`;
    }
  };
  return markdown
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => render(tex, true))
    // Inline: Avoid $100 this kind of amount(require $ after notBlank, $ before notNumber)
    .replace(/(^|[^\d\\])\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_m, pre: string, tex: string) => pre + render(tex, false));
}

/**
 * Obsidian style callout: with > [!note] Title Leading citation block. 
 * marked will put itRenderinto normal blockquote, thisinin HTML layer plus typeStyle. 
 */
const CALLOUT_TYPES: Record<string, { icon: string; cls: string }> = {
  note: { icon: '[note]', cls: 'is-note' },
  info: { icon: 'i', cls: 'is-info' },
  tip: { icon: '[idea]', cls: 'is-tip' },
  warning: { icon: '!', cls: 'is-warning' },
  danger: { icon: '[alarm]', cls: 'is-danger' },
  quote: { icon: '"', cls: 'is-quote' },
  example: { icon: '[test]', cls: 'is-example' },
  todo: { icon: '[x]', cls: 'is-todo' }
};

function renderCallouts(html: string): string {
  return html.replace(
    /<blockquote>\s*<p>\s*\[!(\w+)\]([^<\n]*)/gi,
    (_match, type: string, title: string) => {
      const key = String(type).toLowerCase();
      const meta = CALLOUT_TYPES[key] || CALLOUT_TYPES.note;
      const heading = title.trim() || key.toUpperCase();
      return `<blockquote class="md-callout ${meta.cls}"><p class="md-callout-title">${meta.icon} ${heading}</p><p>`;
    }
  );
}

/**
 * Annotation back-jump link: [[paper:334#ann-12]] -> Clickable Element. 
 *
 * Must in renderWikiLinks run before: else treated as normal backlink, 
 * Click becomes"Note paper:334 not exist, wantCreate?"-- exactly that silent failureFailed. 
 */
const ANNOTATION_LINK = /\[\[paper:(\d+)#ann-(\d+)\]\]/g;

function renderAnnotationLinks(markdown: string): string {
  return markdown.replace(ANNOTATION_LINK, (_match, paperId: string, annotationId: string) =>
    `<a href="#" class="ann-backlink" data-ann-paper="${paperId}" data-ann-id="${annotationId}" title="back to PDF this annotation in"><- back to PDF</a>`
  );
}

function renderWikiLinks(markdown: string, existingTitles?: Set<string>): string {
  // Frontend preview [[Title]] convert toCanClickLink; real backlink relation still viaBackendSaveparse as standard. 
  return markdown.replace(/\[\[([^\]#|]+)(?:[#|][^\]]*)?\]\]/g, (_match, title: string) => {
    const safeTitle = String(title).trim();
    const exists = existingTitles ? existingTitles.has(safeTitle) : true;
    const css = exists ? 'wiki-link' : 'wiki-link wiki-link-missing';
    return `<a href="#" class="${css}" data-wiki-title="${encodeURIComponent(safeTitle)}">[[${safeTitle}]]</a>`;
  });
}

export default function MarkdownPreview({
  content,
  existingTitles,
  onWikiLinkClick,
  onWikiLinkMissing,
  className
}: MarkdownPreviewProps) {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const handlersRef = useRef({ onWikiLinkClick, onWikiLinkMissing, existingTitles });
  handlersRef.current = { onWikiLinkClick, onWikiLinkMissing, existingTitles };

  const html = useMemo(() => {
    // order matters: 
    //   File Embed -> Math -> Annotation Back-jump -> backlink -> marked -> callout afterProcess
    // embedMustmostFirst, otherwise ![[graph.png]] Eaten into dead link by backlink logic; 
    // Formula must be in marked before, otherwise _ ^ * will be treated as Markdown strongCallSyntax. 
    const withEmbeds = renderFileEmbeds(content || '');
    const withMath = renderMath(withEmbeds);
    const withAnnotationLinks = renderAnnotationLinks(withMath);
    const withWikiLinks = renderWikiLinks(withAnnotationLinks, existingTitles);
    const parsed = marked.parse(withWikiLinks, { gfm: true, breaks: false }) as string;
    return DOMPurify.sanitize(renderCallouts(parsed), {
      ADD_ATTR: [
        'data-wiki-title', 'data-ann-paper', 'data-ann-id',
        'controls', 'loading', 'width', 'target', 'rel'
      ],
      ADD_TAGS: ['audio', 'video', 'source'],
      // KaTeX Output large MathML and styled span, Default config clears them. 
      USE_PROFILES: { html: true, mathMl: true, svg: true }
    });
  }, [content, existingTitles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // Annotation back-jump over normal backlink. 
      const backlink = target.closest('a[data-ann-id]') as HTMLAnchorElement | null;
      if (backlink) {
        event.preventDefault();
        const paperId = backlink.dataset.annPaper;
        const annotationId = backlink.dataset.annId;
        if (paperId && annotationId) {
          navigate(`/literature?paper=${paperId}&ann=${annotationId}`);
        }
        return;
      }

      const anchor = target.closest('a[data-wiki-title]') as HTMLAnchorElement | null;
      if (!anchor) return;
      event.preventDefault();
      const title = decodeURIComponent(anchor.dataset.wikiTitle || '');
      const { onWikiLinkClick: customClick, onWikiLinkMissing: customMissing } = handlersRef.current;
      const exists = handlersRef.current.existingTitles?.has(title) ?? true;
      // Vault mode: In-module Jump/Create
      if (customClick || customMissing) {
        if (exists) {
          customClick?.(title);
        } else {
          customMissing?.(title);
        }
        return;
      }
      // legacy mode: Behavior with Phase 1 Exactly Same
      try {
        const note = await getNoteByTitle(title);
        navigate(`/notes/${note.id}`);
      } catch {
        if (window.confirm(`Note"${title}"not exist, wantCreatethisNote?? `)) {
          navigate(`/notes/new?title=${encodeURIComponent(title)}`);
        }
      }
    };
    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [navigate]);

  return (
    <div
      ref={containerRef}
      className={`prose-preview rounded-lg border border-slate-200 bg-white p-4 ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
