import { useRef, useState } from 'react';
import {
  AlignLeft, Bold, CheckSquare, ChevronDown, Code, Eraser, Highlighter, Image, Italic,
  Link2, List, ListOrdered, Minus, Paperclip, Quote, Redo2, Sigma, Strikethrough,
  Table, Underline, Undo2
} from 'lucide-react';
import type { MarkdownEditorHandle } from './MarkdownEditor';

/**
 * Obsidian 式写作工具栏。
 *
 * 之前编辑器上方只有 Tab 和预览切换，所有格式都得手打 Markdown ——
 * 对不熟 Markdown 语法的人等于不可用。
 *
 * 所有按钮都只调用 MarkdownEditor 通过 ref 暴露的命令，
 * 工具栏本身不碰 CodeMirror，这样换编辑器实现时工具栏不用改。
 */

interface Props {
  editor: React.RefObject<MarkdownEditorHandle | null>;
  /** 点「插入图片」时触发文件选择 -> 上传 -> 返回要插入的 Markdown。 */
  onPickFiles: (files: File[]) => Promise<string>;
  disabled?: boolean;
}

/** 标题级别切换用：匹配任意已有的 ATX 标题前缀。 */
const ANY_HEADING = /^#{1,6}\s+/;

export default function EditorToolbar({ editor, onPickFiles, disabled }: Props) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [headingOpen, setHeadingOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const cmd = editor.current;
  const run = (fn: (handle: MarkdownEditorHandle) => void) => () => {
    const handle = editor.current;
    if (handle) fn(handle);
  };

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      const inserted = await onPickFiles(Array.from(files));
      editor.current?.insert(inserted, true);
    } catch (err) {
      window.alert(`插入失败：${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  const Btn = ({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) => (
    <button type="button" className="ed-tool-btn" title={title} aria-label={title} disabled={disabled || !cmd} onClick={onClick}>
      {children}
    </button>
  );

  return (
    <div className="ed-toolbar" role="toolbar" aria-label="写作工具栏">
      <Btn title="撤销 (⌘Z)" onClick={run((h) => h.undo())}><Undo2 size={14} /></Btn>
      <Btn title="重做 (⇧⌘Z)" onClick={run((h) => h.redo())}><Redo2 size={14} /></Btn>
      <Btn title="清除格式" onClick={run((h) => h.clearFormat())}><Eraser size={14} /></Btn>

      <span className="ed-tool-sep" />

      {/* 标题下拉：换级别时先去掉旧的 # 前缀，避免叠成 ###### */}
      <div className="ed-tool-dropdown">
        <button
          type="button"
          className="ed-tool-btn is-wide"
          title="标题级别"
          disabled={disabled || !cmd}
          onClick={() => setHeadingOpen((v) => !v)}
        >
          <AlignLeft size={14} />正文<ChevronDown size={11} />
        </button>
        {headingOpen && (
          <div className="ed-tool-menu" onMouseLeave={() => setHeadingOpen(false)}>
            {[1, 2, 3, 4, 5, 6].map((level) => (
              <button
                key={level}
                type="button"
                className={`ed-tool-menu-item is-h${level}`}
                onClick={() => {
                  editor.current?.prefixLines('#'.repeat(level) + ' ', ANY_HEADING);
                  setHeadingOpen(false);
                }}
              >
                标题 {level}
              </button>
            ))}
            <button
              type="button"
              className="ed-tool-menu-item"
              onClick={() => {
                editor.current?.prefixLines('', ANY_HEADING);
                setHeadingOpen(false);
              }}
            >
              正文（清除标题）
            </button>
          </div>
        )}
      </div>

      <span className="ed-tool-sep" />

      <Btn title="加粗 (⌘B)" onClick={run((h) => h.wrap('**'))}><Bold size={14} /></Btn>
      <Btn title="斜体 (⌘I)" onClick={run((h) => h.wrap('*'))}><Italic size={14} /></Btn>
      <Btn title="删除线" onClick={run((h) => h.wrap('~~'))}><Strikethrough size={14} /></Btn>
      <Btn title="下划线（HTML）" onClick={run((h) => h.wrap('<u>', '</u>'))}><Underline size={14} /></Btn>
      <Btn title="高亮 ==文字==" onClick={run((h) => h.wrap('=='))}><Highlighter size={14} /></Btn>
      <Btn title="行内代码" onClick={run((h) => h.wrap('`'))}><Code size={14} /></Btn>

      <span className="ed-tool-sep" />

      <Btn title="无序列表" onClick={run((h) => h.prefixLines('- '))}><List size={14} /></Btn>
      <Btn title="有序列表" onClick={run((h) => h.prefixLines('1. '))}><ListOrdered size={14} /></Btn>
      <Btn title="任务列表" onClick={run((h) => h.prefixLines('- [ ] '))}><CheckSquare size={14} /></Btn>
      <Btn title="引用" onClick={run((h) => h.prefixLines('> '))}><Quote size={14} /></Btn>

      <span className="ed-tool-sep" />

      <Btn title="链接" onClick={run((h) => h.wrap('[', '](url)'))}><Link2 size={14} /></Btn>
      <Btn
        title="插入图片 / 音视频（上传到 Attachments）"
        onClick={() => fileInputRef.current?.click()}
      >
        {busy ? <span className="ed-tool-spinner" /> : <Image size={14} />}
      </Btn>
      <Btn title="插入附件（同上，任意允许类型）" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /></Btn>
      <Btn
        title="插入表格"
        onClick={run((h) => h.insert('\n| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n', true))}
      >
        <Table size={14} />
      </Btn>
      <Btn title="数学公式块" onClick={run((h) => h.insert('\n$$\n\n$$\n', true))}><Sigma size={14} /></Btn>
      <Btn title="分隔线" onClick={run((h) => h.insert('\n---\n', true))}><Minus size={14} /></Btn>

      <span className="ed-tool-sep" />

      {/* Obsidian 的 callout —— 研究笔记里标注意事项/结论很常用 */}
      <div className="ed-tool-dropdown">
        <button
          type="button"
          className="ed-tool-btn is-wide"
          title="插入 Callout 提示块"
          disabled={disabled || !cmd}
          onClick={() => {
            const el = document.getElementById('ed-callout-menu');
            if (el) el.classList.toggle('is-open');
          }}
        >
          Callout<ChevronDown size={11} />
        </button>
        <div className="ed-tool-menu" id="ed-callout-menu">
          {[
            ['note', '📝 笔记'],
            ['tip', '💡 提示'],
            ['warning', '⚠️ 注意'],
            ['danger', '🚨 危险'],
            ['example', '🧪 示例'],
            ['todo', '☑️ 待办']
          ].map(([type, label]) => (
            <button
              key={type}
              type="button"
              className="ed-tool-menu-item"
              onClick={() => {
                editor.current?.insert(`\n> [!${type}] 标题\n> 内容\n`, true);
                document.getElementById('ed-callout-menu')?.classList.remove('is-open');
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,audio/*,video/*,.pdf"
        style={{ display: 'none' }}
        onChange={(event) => void handleFiles(event.target.files)}
      />
    </div>
  );
}
