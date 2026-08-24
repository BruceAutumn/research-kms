import { useRef, useState } from 'react';
import {
  AlignLeft, Bold, CheckSquare, ChevronDown, Code, Eraser, Highlighter, Image, Italic,
  Link2, List, ListOrdered, Minus, Paperclip, Quote, Redo2, Sigma, Strikethrough,
  Table, Underline, Undo2
} from 'lucide-react';
import type { MarkdownEditorHandle } from './MarkdownEditor';

/**
 * Obsidian writingToolbar. 
 *
 * beforeEditabove only Tab and preview toggle, allFormatall manual Markdown --
 * Unfamiliar Markdown Syntax unavailable. 
 *
 * allButtonall onlyCall MarkdownEditor via ref Exposed Commands, 
 * Toolbar itself untouched CodeMirror, thusChangeEditon implToolbar no change. 
 */

interface Props {
  editor: React.RefObject<MarkdownEditorHandle | null>;
  /** Point"Insert Image"whenTriggerFileSelect -> Upload -> Return to insert Markdown.  */
  onPickFiles: (files: File[]) => Promise<string>;
  disabled?: boolean;
}

/** Title level switch uses: Match any existing ATX Title Prefix.  */
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
      window.alert(`Insert failed: ${err instanceof Error ? err.message : String(err)}`);
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
    <div className="ed-toolbar" role="toolbar" aria-label="writingToolbar">
      <Btn title="Undo (CmdZ)" onClick={run((h) => h.undo())}><Undo2 size={14} /></Btn>
      <Btn title="Redo (ShiftCmdZ)" onClick={run((h) => h.redo())}><Redo2 size={14} /></Btn>
      <Btn title="Clear Format" onClick={run((h) => h.clearFormat())}><Eraser size={14} /></Btn>

      <span className="ed-tool-sep" />

      {/* Title Dropdown: Remove old on level change # prefix, Avoid stacking ###### */}
      <div className="ed-tool-dropdown">
        <button
          type="button"
          className="ed-tool-btn is-wide"
          title="Title Level"
          disabled={disabled || !cmd}
          onClick={() => setHeadingOpen((v) => !v)}
        >
          <AlignLeft size={14} />Body<ChevronDown size={11} />
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
                Title {level}
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
              Body(Clear Title)
            </button>
          </div>
        )}
      </div>

      <span className="ed-tool-sep" />

      <Btn title="Bold (CmdB)" onClick={run((h) => h.wrap('**'))}><Bold size={14} /></Btn>
      <Btn title="Italic (CmdI)" onClick={run((h) => h.wrap('*'))}><Italic size={14} /></Btn>
      <Btn title="Strikethrough" onClick={run((h) => h.wrap('~~'))}><Strikethrough size={14} /></Btn>
      <Btn title="Underline(HTML)" onClick={run((h) => h.wrap('<u>', '</u>'))}><Underline size={14} /></Btn>
      <Btn title="Highlight ==text==" onClick={run((h) => h.wrap('=='))}><Highlighter size={14} /></Btn>
      <Btn title="Inline Code" onClick={run((h) => h.wrap('`'))}><Code size={14} /></Btn>

      <span className="ed-tool-sep" />

      <Btn title="Unordered List" onClick={run((h) => h.prefixLines('- '))}><List size={14} /></Btn>
      <Btn title="orderedList" onClick={run((h) => h.prefixLines('1. '))}><ListOrdered size={14} /></Btn>
      <Btn title="Task List" onClick={run((h) => h.prefixLines('- [ ] '))}><CheckSquare size={14} /></Btn>
      <Btn title="Reference" onClick={run((h) => h.prefixLines('> '))}><Quote size={14} /></Btn>

      <span className="ed-tool-sep" />

      <Btn title="Link" onClick={run((h) => h.wrap('[', '](url)'))}><Link2 size={14} /></Btn>
      <Btn
        title="Insert Image / Audio/Video(Upload to Attachments)"
        onClick={() => fileInputRef.current?.click()}
      >
        {busy ? <span className="ed-tool-spinner" /> : <Image size={14} />}
      </Btn>
      <Btn title="Insert Attachment(same as above, Any allowed type)" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /></Btn>
      <Btn
        title="Insert Table"
        onClick={run((h) => h.insert('\n| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n|  |  |  |\n', true))}
      >
        <Table size={14} />
      </Btn>
      <Btn title="Math Block" onClick={run((h) => h.insert('\n$$\n\n$$\n', true))}><Sigma size={14} /></Btn>
      <Btn title="Divider" onClick={run((h) => h.insert('\n---\n', true))}><Minus size={14} /></Btn>

      <span className="ed-tool-sep" />

      {/* Obsidian   callout -- researchNoteinAnnotationnotes/Conclusion is common */}
      <div className="ed-tool-dropdown">
        <button
          type="button"
          className="ed-tool-btn is-wide"
          title="Insert Callout Hint Block"
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
            ['note', '[note] Note'],
            ['tip', '[idea] Hint'],
            ['warning', '! note'],
            ['danger', '[alarm] danger'],
            ['example', '[test] Example'],
            ['todo', '[x] Todo']
          ].map(([type, label]) => (
            <button
              key={type}
              type="button"
              className="ed-tool-menu-item"
              onClick={() => {
                editor.current?.insert(`\n> [!${type}] Title\n> content\n`, true);
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
