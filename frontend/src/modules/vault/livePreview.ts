import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder, StateField } from '@codemirror/state';
import type { EditorState, Extension } from '@codemirror/state';
import {
  Decoration, EditorView, ViewPlugin, WidgetType
} from '@codemirror/view';
import type { DecorationSet, ViewUpdate } from '@codemirror/view';
import katex from 'katex';
import { vaultFileUrl } from '../../api/client';

/**
 * Obsidian style Live Preview. 
 *
 * ruleand Obsidian Consistent: **Show raw syntax at cursor line, Other lines show render**. 
 * thus bothWYSIWYG, and will not when you are about toEditsomeSegmentSyntaxwhen hide it causing uneditable. 
 *
 * impl is CodeMirror decoration, notReplaceEditbody(R7: upgrade no rewrite)--
 * turn this offExtensionthen backOriginalrawSource Mode, Other behavior unchanged. 
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** Inline Image:   ![[graph.png]] in placeChangeintoRealImage.  */
class ImageWidget extends WidgetType {
  constructor(private readonly name: string, private readonly width?: string) {
    super();
  }

  // Same name and width widget treat as same, Avoid reload image on repaint causing flicker. 
  eq(other: ImageWidget) {
    return other.name === this.name && other.width === this.width;
  }

  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-lp-embed';
    const img = document.createElement('img');
    const path = this.name.includes('/') ? this.name : `Attachments/${this.name}`;
    img.src = vaultFileUrl(path);
    img.alt = this.name;
    if (this.width) img.width = Number(this.width);
    img.loading = 'lazy';
    wrap.appendChild(img);
    return wrap;
  }

  ignoreEvent() {
    return false;
  }
}

/** Inline / Block Math. andImagesame mechanism: Show render when cursor not on line.  */
class MathWidget extends WidgetType {
  constructor(private readonly tex: string, private readonly display: boolean) {
    super();
  }

  eq(other: MathWidget) {
    return other.tex === this.tex && other.display === this.display;
  }

  toDOM() {
    const span = document.createElement('span');
    span.className = this.display ? 'cm-lp-math is-display' : 'cm-lp-math';
    try {
      span.innerHTML = katex.renderToString(this.tex.trim(), {
        displayMode: this.display,
        throwOnError: false,
        output: 'html'
      });
    } catch {
      // Fall back to raw on formula error, not let wholeLinedisappear. 
      span.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
      span.classList.add('is-error');
    }
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/** Horizontal Divider --- */
class RuleWidget extends WidgetType {
  eq() {
    return true;
  }
  toDOM() {
    const hr = document.createElement('span');
    hr.className = 'cm-lp-hr';
    return hr;
  }
}

/** Cursor(or selection)coveredLine Numberset -- These lines keep raw syntax.  */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

/** Syntax Mark Node -> Hidden; Container Node -> Add Style Class.  */
const MARK_NODES = new Set(['HeaderMark', 'EmphasisMark', 'CodeMark', 'QuoteMark', 'StrikethroughMark']);
const STYLE_NODES: Record<string, string> = {
  StrongEmphasis: 'cm-lp-strong',
  Emphasis: 'cm-lp-em',
  InlineCode: 'cm-lp-code',
  Strikethrough: 'cm-lp-strike'
};

const EMBED_RE = /!\[\[([^\]|]+?)(?:\|(\d+))?\]\]/g;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const BLOCK_MATH_RE = /\$\$([\s\S]+?)\$\$/g;
// Inline Formula: $ before cannot beNumberor backslash, $ after cannot beBlank -- Avoid $100 this kind of amount. 
const INLINE_MATH_RE = /(^|[^\d\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = activeLines(view.state);
  const doc = view.state.doc;

  // Sort after collect: RangeSetBuilder requireBy from incrementAdd, 
  // Syntax tree traversal and regex scan are independent, order not guaranteed. 
  const pending: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const { from, to } of view.visibleRanges) {
    // --- 1. Title line enlarged ---
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const heading = /^(#{1,6})\s/.exec(line.text);
      if (heading) {
        pending.push({
          from: line.from,
          to: line.from,
          deco: Decoration.line({ class: `cm-lp-h${heading[1].length}` })
        });
      }
      if (HR_RE.test(line.text) && !active.has(line.number) && line.text.trim().length > 0) {
        pending.push({ from: line.from, to: line.to, deco: Decoration.replace({ widget: new RuleWidget() }) });
      }
      if (line.to >= to) break;
      pos = line.to + 1;
    }

    // --- 2. Syntax Tree: Hidden Mark, Add style to container ---
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const lineNo = doc.lineAt(node.from).number;
        const styleClass = STYLE_NODES[node.name];
        if (styleClass) {
          pending.push({ from: node.from, to: node.to, deco: Decoration.mark({ class: styleClass }) });
          return;
        }
        // mark only at"Cursor not on line"hide when, else cannot edit your syntaxSyntax. 
        if (MARK_NODES.has(node.name) && !active.has(lineNo) && node.to > node.from) {
          pending.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
        }
      }
    });

    // --- 3. Inline Math ---
    // onlyProcessnot crossLine : CodeMirror explicitly forbid ViewPlugin provide"Replace newlines"  decoration
    // (Will throw RangeError), Multi-line block formula by blockMathField go StateField provide. 
    const inlineText = doc.sliceString(from, to);
    let mathMatch: RegExpExecArray | null;
    INLINE_MATH_RE.lastIndex = 0;
    while ((mathMatch = INLINE_MATH_RE.exec(inlineText)) !== null) {
      // capture group 1 is leading char(used forAvoid $100), Formula body starts after it. 
      const start = from + mathMatch.index + mathMatch[1].length;
      const end = from + mathMatch.index + mathMatch[0].length;
      if (active.has(doc.lineAt(start).number)) continue;
      // Skip when overlapping block math, Avoid double replace same segment. 
      if (pending.some((item) => start < item.to && end > item.from)) continue;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.replace({ widget: new MathWidget(mathMatch[2], false) })
      });
    }

    // --- 4. Image Embed ---
    const text = doc.sliceString(from, to);
    EMBED_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = EMBED_RE.exec(text)) !== null) {
      const start = from + match.index;
      const end = start + match[0].length;
      const name = match[1].trim();
      if (!IMAGE_EXT.test(name)) continue;
      if (active.has(doc.lineAt(start).number)) continue;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.replace({ widget: new ImageWidget(name, match[2]) })
      });
    }
  }

  // line decoration(from === to)Must rank same-position others decoration front. 
  pending.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const item of pending) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

/**
 * Multi-line block formula must be StateField provide -- CodeMirror disallow ViewPlugin provide
 * willReplaceChangeLinesymbol decoration, Hard write throws RangeError and crash the editor. 
 * use block: true wholeLineReplace, range strictToalign toLinefirstLinetail. 
 */
function buildBlockMath(state: EditorState): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = activeLines(state);
  const doc = state.doc;
  const full = doc.toString();
  BLOCK_MATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_MATH_RE.exec(full)) !== null) {
    const startLine = doc.lineAt(match.index);
    const endLine = doc.lineAt(match.index + match[0].length);
    // only take over"$$ occupy wholeLine"way of writing; Inline $$..$$ hand toInlinerule, Avoid eating same-line content. 
    if (startLine.text.trim() !== '$$' || endLine.text.trim() !== '$$') continue;
    let touched = false;
    for (let n = startLine.number; n <= endLine.number; n++) if (active.has(n)) touched = true;
    if (touched) continue;
    builder.add(startLine.from, endLine.to, Decoration.replace({
      widget: new MathWidget(match[1], true),
      block: true
    }));
  }
  return builder.finish();
}

const blockMathField = StateField.define<DecorationSet>({
  create: (state) => buildBlockMath(state),
  update: (deco, tr) => (tr.docChanged || tr.selection ? buildBlockMath(tr.state) : deco),
  provide: (field) => EditorView.decorations.from(field)
});

/**
 * Live Preview Extension. pass to MarkdownEditor   extensions; notLoadwhenBehavior withbeforeExactly Same. 
 */
export function livePreview(): Extension {
  return [blockMathField, inlinePreviewPlugin()];
}

function inlinePreviewPlugin(): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view);
      }

      update(update: ViewUpdate) {
        // Recompute on selection change -- Line switches to render when cursor leaves. 
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // be replace Hidden syntax marks should not appear in copied content -- But must not lose raw text, 
      // so thisinnot provide atomicRanges, Cursor can pass hidden area. 
      provide: () => []
    }
  );
}
