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
   * Phase 4 可选扩展（legacy 调用行为不变）：
   * - existingTitles：Vault 内已存在的笔记标题集合，未创建的 [[链接]] 显示虚线下划线
   * - onWikiLinkClick / onWikiLinkMissing：Vault 模块接管双链跳转与创建
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
 * Obsidian 的文件嵌入语法 ![[文件名]] / ![[文件名|宽度]]。
 *
 * 必须跑在 renderWikiLinks 之前：否则 ![[图.png]] 会被当成普通双链，
 * 渲染成一个指向「图.png 这篇笔记」的死链接，而不是把图显示出来。
 *
 * 附件统一放在 Attachments/（与上传端点一致）；若写法里已带目录则按原样解析。
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
      return `<a class="md-embed md-embed-file" href="${src}" target="_blank" rel="noreferrer">📄 ${name}</a>`;
    }
    // 不认识的类型不猜，退回普通双链交给 wiki-link 逻辑处理。
    return match.slice(1);
  });
}

/**
 * 数学公式。$$...$$ 块级、$...$ 行内。
 * 在 marked 之前就渲染成 HTML，避免 Markdown 把 _ ^ * 当成强调语法吃掉。
 */
function renderMath(markdown: string): string {
  const render = (tex: string, displayMode: boolean) => {
    try {
      return katex.renderToString(tex.trim(), { displayMode, throwOnError: false, output: 'html' });
    } catch {
      // 公式写错不该让整篇笔记渲染失败，原样退回。
      return displayMode ? `<pre class="md-math-error">$$${tex}$$</pre>` : `<code class="md-math-error">$${tex}$</code>`;
    }
  };
  return markdown
    .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => render(tex, true))
    // 行内：避开 $100 这类金额（要求 $ 后不是空白、$ 前不是数字）
    .replace(/(^|[^\d\\])\$(?!\s)([^$\n]+?)(?<!\s)\$/g, (_m, pre: string, tex: string) => pre + render(tex, false));
}

/**
 * Obsidian 式 callout：以 > [!note] 标题 开头的引用块。
 * marked 会把它渲染成普通 blockquote，这里在 HTML 层加上类型样式。
 */
const CALLOUT_TYPES: Record<string, { icon: string; cls: string }> = {
  note: { icon: '📝', cls: 'is-note' },
  info: { icon: 'ℹ️', cls: 'is-info' },
  tip: { icon: '💡', cls: 'is-tip' },
  warning: { icon: '⚠️', cls: 'is-warning' },
  danger: { icon: '🚨', cls: 'is-danger' },
  quote: { icon: '❝', cls: 'is-quote' },
  example: { icon: '🧪', cls: 'is-example' },
  todo: { icon: '☑️', cls: 'is-todo' }
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
 * 标注回跳链接：[[paper:334#ann-12]] -> 可点元素。
 *
 * 必须在 renderWikiLinks 之前跑：否则会被当成普通双链，
 * 点下去变成「笔记 paper:334 不存在，要创建吗」—— 正是那种静默走错的失败。
 */
const ANNOTATION_LINK = /\[\[paper:(\d+)#ann-(\d+)\]\]/g;

function renderAnnotationLinks(markdown: string): string {
  return markdown.replace(ANNOTATION_LINK, (_match, paperId: string, annotationId: string) =>
    `<a href="#" class="ann-backlink" data-ann-paper="${paperId}" data-ann-id="${annotationId}" title="回到 PDF 中的这处标注">↩ 回到 PDF</a>`
  );
}

function renderWikiLinks(markdown: string, existingTitles?: Set<string>): string {
  // 前端预览把 [[标题]] 转成可点击链接；真正的双链关系仍以后端保存时解析为准。
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
    // 顺序有讲究：
    //   文件嵌入 -> 数学公式 -> 标注回跳 -> 双链 -> marked -> callout 后处理
    // 嵌入必须最先，否则 ![[图.png]] 会被双链逻辑吃成死链接；
    // 公式必须在 marked 之前，否则 _ ^ * 会被当成 Markdown 强调语法。
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
      // KaTeX 输出大量 MathML 与带样式的 span，默认配置会把它们清掉。
      USE_PROFILES: { html: true, mathMl: true, svg: true }
    });
  }, [content, existingTitles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onClick = async (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      // 标注回跳优先于普通双链。
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
      // Vault 模式：模块内跳转/创建
      if (customClick || customMissing) {
        if (exists) {
          customClick?.(title);
        } else {
          customMissing?.(title);
        }
        return;
      }
      // legacy 模式：行为与 Phase 1 完全一致
      try {
        const note = await getNoteByTitle(title);
        navigate(`/notes/${note.id}`);
      } catch {
        if (window.confirm(`笔记「${title}」不存在，要创建这篇笔记吗？`)) {
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
