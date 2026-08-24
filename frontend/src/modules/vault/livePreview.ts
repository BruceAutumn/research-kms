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
 * Obsidian 式 Live Preview。
 *
 * 规则和 Obsidian 一致：**光标所在行显示原始语法，其它行显示渲染结果**。
 * 这样既能所见即所得，又不会在你正要编辑某段语法时把它藏起来导致改不了。
 *
 * 实现方式是 CodeMirror decoration，不替换编辑器本体（R7：升级不重写）——
 * 关掉这个扩展就回到原来的纯源码模式，其余行为一字不变。
 */

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i;

/** 行内图片：把 ![[图.png]] 就地换成真实图片。 */
class ImageWidget extends WidgetType {
  constructor(private readonly name: string, private readonly width?: string) {
    super();
  }

  // 同名同宽的 widget 视为相同，避免每次重绘都重新加载图片导致闪烁。
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

/** 行内 / 块级数学公式。和图片同样的机制：光标不在本行时换成渲染结果。 */
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
      // 公式写坏时退回原文，不让整行消失。
      span.textContent = this.display ? `$$${this.tex}$$` : `$${this.tex}$`;
      span.classList.add('is-error');
    }
    return span;
  }

  ignoreEvent() {
    return false;
  }
}

/** 水平分隔线 --- */
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

/** 光标（或选区）所覆盖的行号集合 —— 这些行保持原始语法。 */
function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const from = state.doc.lineAt(range.from).number;
    const to = state.doc.lineAt(range.to).number;
    for (let n = from; n <= to; n++) lines.add(n);
  }
  return lines;
}

/** 语法标记节点 -> 隐藏；容器节点 -> 加样式类。 */
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
// 行内公式：$ 前不能是数字或反斜杠、$ 后不能是空白 —— 避开 $100 这类金额。
const INLINE_MATH_RE = /(^|[^\d\\$])\$(?!\s)([^$\n]+?)(?<!\s)\$/g;

function buildDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const active = activeLines(view.state);
  const doc = view.state.doc;

  // 收集后统一排序：RangeSetBuilder 要求按 from 递增添加，
  // 而语法树遍历与正则扫描是两条独立来源，顺序不保证。
  const pending: Array<{ from: number; to: number; deco: Decoration }> = [];

  for (const { from, to } of view.visibleRanges) {
    // --- 1. 标题行整行放大 ---
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

    // --- 2. 语法树：隐藏标记、给容器加样式 ---
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
        // 标记符号只在「光标不在本行」时隐藏，否则你会改不动自己正在写的语法。
        if (MARK_NODES.has(node.name) && !active.has(lineNo) && node.to > node.from) {
          pending.push({ from: node.from, to: node.to, deco: Decoration.replace({}) });
        }
      }
    });

    // --- 3. 行内数学公式 ---
    // 只处理不跨行的：CodeMirror 明确禁止 ViewPlugin 提供「替换掉换行符」的 decoration
    // （会抛 RangeError），跨行的块级公式由下面的 blockMathField 走 StateField 提供。
    const inlineText = doc.sliceString(from, to);
    let mathMatch: RegExpExecArray | null;
    INLINE_MATH_RE.lastIndex = 0;
    while ((mathMatch = INLINE_MATH_RE.exec(inlineText)) !== null) {
      // 捕获组 1 是前导字符（用于避开 $100），公式本体从它之后开始。
      const start = from + mathMatch.index + mathMatch[1].length;
      const end = from + mathMatch.index + mathMatch[0].length;
      if (active.has(doc.lineAt(start).number)) continue;
      // 与块级公式重叠时跳过，避免同一段被替换两次。
      if (pending.some((item) => start < item.to && end > item.from)) continue;
      pending.push({
        from: start,
        to: end,
        deco: Decoration.replace({ widget: new MathWidget(mathMatch[2], false) })
      });
    }

    // --- 4. 图片嵌入 ---
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

  // line decoration（from === to）必须排在同位置的其它 decoration 前面。
  pending.sort((a, b) => a.from - b.from || a.to - b.to);
  for (const item of pending) builder.add(item.from, item.to, item.deco);
  return builder.finish();
}

/**
 * 跨行块级公式必须由 StateField 提供 —— CodeMirror 不允许 ViewPlugin 提供
 * 会替换换行符的 decoration，硬来会抛 RangeError 并把整个编辑器打崩。
 * 用 block: true 的整行替换，范围严格对齐到行首行尾。
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
    // 只接管「$$ 独占整行」的写法；行内 $$..$$ 交给行内规则，避免吃掉同行其它内容。
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
 * Live Preview 扩展。传给 MarkdownEditor 的 extensions；不加载时行为与之前完全一致。
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
        // 选区变化也要重算 —— 光标移出某行时那行才切换成渲染态。
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view);
        }
      }
    },
    {
      decorations: (plugin) => plugin.decorations,
      // 被 replace 隐藏的语法标记不该出现在复制内容里 —— 但也不能真的丢掉原文，
      // 所以这里不提供 atomicRanges，光标仍可穿过隐藏区域。
      provide: () => []
    }
  );
}
