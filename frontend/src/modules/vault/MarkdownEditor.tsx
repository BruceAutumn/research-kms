import { forwardRef, useImperativeHandle, useEffect, useMemo, useRef } from 'react';
import { livePreview } from './livePreview';
import { EditorState } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, drawSelection
} from '@codemirror/view';
import {
  defaultKeymap, history, historyKeymap, indentWithTab,
  undo, redo
} from '@codemirror/commands';
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching } from '@codemirror/language';
import { autocompletion, startCompletion, type Completion } from '@codemirror/autocomplete';
import { searchKeymap } from '@codemirror/search';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';

export interface TitleSuggestion {
  title: string;
  path: string;
}

interface MarkdownEditorProps {
  value: string;
  titles: TitleSuggestion[];
  tags: string[];
  onChange: (content: string) => void;
  onSave: () => void;
  /** Outline Click Jump: Line Number(1-based)+ orderColumnnumber */
  scrollRequest?: { seq: number; line: number } | null;
  /**
   * Paste / Dragged-in file. Return to insert into editor Markdown text(Usually ![[Name]]). 
   * by EditorPane responsible for realUpload, Editor only replaces cursor with returned text. 
   */
  onDropFiles?: (files: File[]) => Promise<string>;
  /** Live Preview(Obsidian WYSIWYG); false when back to pureSource Mode.  */
  livePreviewOn?: boolean;
}

/**
 * Insert upload result at cursor. 
 * Insert placeholder during upload, SuccessafterReplace -- LargeFileUploadtakes seconds, 
 * Without placeholder user may paste twice. 
 */
async function insertUploaded(view: EditorView, files: File[], dropPos?: number) {
  const handler = uploadHandlerRef.current;
  if (!handler) return;
  const at = dropPos ?? view.state.selection.main.head;
  const placeholder = `... Uploading ${files.length}  File...`;
  view.dispatch({ changes: { from: at, insert: placeholder }, selection: { anchor: at + placeholder.length } });
  let inserted: string;
  try {
    inserted = await handler(files);
  } catch (err) {
    inserted = `! Upload failed: ${err instanceof Error ? err.message : String(err)}`;
  }
  // documentMayalready changed elsewhere, Locate placeholder by content not offset. 
  const text = view.state.doc.toString();
  const idx = text.indexOf(placeholder);
  if (idx >= 0) {
    view.dispatch({
      changes: { from: idx, to: idx + placeholder.length, insert: inserted },
      selection: { anchor: idx + inserted.length }
    });
  }
}

/** insertUploaded isModulelevel function, use this ref get currentExample UploadCallback.  */
const uploadHandlerRef: { current: ((files: File[]) => Promise<string>) | null } = { current: null };

const EDITOR_THEME = EditorView.theme({
  '&': { backgroundColor: 'var(--bg-app)', color: 'var(--text-primary)', fontSize: '13px', height: '100%' },
  '.cm-content': { fontFamily: 'var(--font-mono)', padding: '10px 4px 200px', caretColor: 'var(--accent)' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--bg-active)' },
  '.cm-line': { lineHeight: '1.65' },
  '.cm-gutters': { backgroundColor: 'var(--bg-panel)', color: 'var(--text-tertiary)', borderRight: '1px solid var(--border)' },
  '.cm-activeLine': { backgroundColor: 'var(--bg-hover)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--bg-hover)', color: 'var(--text-secondary)' },
  '.cm-tooltip': { backgroundColor: 'var(--bg-app)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', color: 'var(--text-primary)' },
  '.cm-tooltip-autocomplete > ul > li': { fontSize: '13px' },
  '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--bg-selected)', color: 'var(--text-primary)' },
  '.cm-panels': { backgroundColor: 'var(--bg-panel)', color: 'var(--text-primary)' },
  '.cm-searchMatch': { backgroundColor: 'var(--bg-active)', outline: '1px solid var(--border-strong)' }
}, { dark: false });

/**
 * CodeMirror 6 Markdown Editdevice(Source Mode + Syntax Highlight). 
 * [[Wiki Link]] and #Tag Autocomplete; Cmd+S Save; Body Highlight. 
 */
/**
 * Toolbar via ref Called edit command. put hereinInstead ofletToolbar directly touch EditorView, 
 * is to"how to change doc"this matter inEditdeviceInternal -- Toolbar only expresses intent. 
 */
export interface MarkdownEditorHandle {
  /** use before/after Wrap Selection; Insert and center cursor on no selection. againClickwill unwrap(toggle).  */
  wrap: (before: string, after?: string) => void;
  /** Add prefix to each selected line(Title, List, Reference). Remove if same prefix exists.  */
  prefixLines: (prefix: string, exclusive?: RegExp) => void;
  /** Insert text at cursor; block as true when ensure new lineOneLine.  */
  insert: (text: string, block?: boolean) => void;
  /** Clear selected lines Markdown mark.  */
  clearFormat: () => void;
  undo: () => void;
  redo: () => void;
  focus: () => void;
}

const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(function MarkdownEditor(
  { value, titles, tags, onChange, onSave, scrollRequest, onDropFiles, livePreviewOn = true },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onDropFilesRef = useRef(onDropFiles);
  onDropFilesRef.current = onDropFiles;
  uploadHandlerRef.current = onDropFiles ?? null;
  const onSaveRef = useRef(onSave);
  const scrollSeqRef = useRef(-1);
  const titlesRef = useRef(titles);
  const tagsRef = useRef(tags);
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  titlesRef.current = titles;
  tagsRef.current = tags;

  // [[...]] complete
  const wikiCompletion = useMemo(
    () =>
      (context: { matchBefore: (pattern: RegExp) => { from: number; to: number; text: string } | null }) => {
        const word = context.matchBefore(/\[\[[^\]\n]*/);
        if (!word || word.from === word.to) return null;
        const typed = word.text.slice(2).trim().toLowerCase();
        const options: Completion[] = titlesRef.current
          .filter((item) => !typed || item.title.toLowerCase().includes(typed))
          .slice(0, 30)
          .map((item) => ({
            label: item.title,
            detail: item.path,
            apply: `[[${item.title}]]`
          }));
        return {
          from: word.from,
          options,
          validFor: /^\[\[[^\]\n]*$/
        };
      },
    []
  );

  // #Tag complete(# after followed by nonEmptychar counts asTag)
  const tagCompletion = useMemo(
    () =>
      (context: { matchBefore: (pattern: RegExp) => { from: number; to: number; text: string } | null }) => {
        const word = context.matchBefore(/(^|\s)#[^\s#]*$/);
        if (!word || word.from === word.to) return null;
        const typed = word.text.trim().slice(1).toLowerCase();
        const options: Completion[] = tagsRef.current
          .filter((tag) => !typed || tag.toLowerCase().includes(typed))
          .slice(0, 20)
          .map((tag) => ({ label: `#${tag}`, apply: `#${tag}` }));
        return {
          from: word.from + word.text.indexOf('#'),
          options,
          validFor: /#[^\s#]*$/
        };
      },
    []
  );

  // mountOnetime
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let viewRefLocal: EditorView | null = null;
    // Auto trigger completion: Input [[ or #tag when pop
    const autocompleteTrigger = EditorView.updateListener.of((update) => {
      if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('input.type'))) return;
      const view = viewRefLocal;
      if (!view) return;
      const pos = update.state.selection.main.head;
      const before = update.state.doc.sliceString(Math.max(0, pos - 3), pos);
      if (before.endsWith('[[') || (before.startsWith('#') && !before.includes(' ') && before.length === 2)) {
        setTimeout(() => startCompletion(view), 0);
      }
    });

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        drawSelection(),
        bracketMatching(),
        markdown({ base: markdownLanguage }),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        // WYSIWYG: Show raw syntax at cursor line, Other lines render. turn offI.e.back to pureSource Mode. 
        ...(livePreviewOn ? [livePreview()] : []),
        EditorView.lineWrapping,
        EDITOR_THEME,
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
          { key: 'Mod-s', run: () => { onSaveRef.current(); return true; } }
        ]),
        autocompletion({
          override: [wikiCompletion, tagCompletion],
          activateOnTyping: true,
          defaultKeymap: true
        }),
        autocompleteTrigger,
        // Paste / Drag File -> Upload to Attachments/ -> Insert at cursor ![[Name]]. 
        // Obsidian  Corefeel is this: screenshot directly Cmd+V then enterNote. 
        EditorView.domEventHandlers({
          paste(event, view) {
            const files = Array.from(event.clipboardData?.files || []);
            if (files.length === 0 || !onDropFilesRef.current) return false;
            event.preventDefault();
            void insertUploaded(view, files);
            return true;
          },
          drop(event, view) {
            const files = Array.from(event.dataTransfer?.files || []);
            if (files.length === 0 || !onDropFilesRef.current) return false;
            event.preventDefault();
            const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
            void insertUploaded(view, files, pos ?? undefined);
            return true;
          }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        })
      ]
    });

    const view = new EditorView({ state, parent: host });
    viewRefLocal = view;
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // livePreviewOn need rebuild on changeEditdevice, otherwiseCutChangemode not effective. 
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePreviewOn]);

  // External content change(CutChange Tab / Conflict discard rollback)-> Replace whole doc
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
  }, [value]);

  // Outline Jump
  useEffect(() => {
    const view = viewRef.current;
    const req = scrollRequest;
    if (!view || !req || req.seq === scrollSeqRef.current) return;
    scrollSeqRef.current = req.seq;
    const line = view.state.doc.line(Math.max(1, Math.min(req.line ?? 1, view.state.doc.lines)));
    view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start' }) });
    view.focus();
  }, [scrollRequest]);

  useImperativeHandle(ref, (): MarkdownEditorHandle => ({
    wrap(before, after = before) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const selected = view.state.sliceDoc(from, to);
      // already wrapped by same mark -> unwrap, implementButton  toggle feel. 
      const outer = view.state.sliceDoc(Math.max(0, from - before.length), Math.min(view.state.doc.length, to + after.length));
      if (selected && outer === before + selected + after) {
        view.dispatch({
          changes: { from: from - before.length, to: to + after.length, insert: selected },
          selection: { anchor: from - before.length, head: to - before.length }
        });
        view.focus();
        return;
      }
      view.dispatch({
        changes: { from, to, insert: before + selected + after },
        selection: selected
          ? { anchor: from + before.length, head: from + before.length + selected.length }
          : { anchor: from + before.length }
      });
      view.focus();
    },

    prefixLines(prefix, exclusive) {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const first = view.state.doc.lineAt(from);
      const last = view.state.doc.lineAt(to);
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      for (let n = first.number; n <= last.number; n++) {
        const line = view.state.doc.line(n);
        const already = line.text.startsWith(prefix);
        // exclusive used for"Change H1": Remove old same-type prefix before adding new. 
        const stripped = exclusive ? line.text.replace(exclusive, '') : line.text;
        const next = already ? line.text.slice(prefix.length) : prefix + stripped;
        changes.push({ from: line.from, to: line.to, insert: next });
      }
      view.dispatch({ changes });
      view.focus();
    },

    insert(text, block = false) {
      const view = viewRef.current;
      if (!view) return;
      const pos = view.state.selection.main.head;
      const line = view.state.doc.lineAt(pos);
      const needsBreak = block && line.text.trim().length > 0;
      const payload = needsBreak ? `\n${text}` : text;
      const at = needsBreak ? line.to : pos;
      view.dispatch({ changes: { from: at, insert: payload }, selection: { anchor: at + payload.length } });
      view.focus();
    },

    clearFormat() {
      const view = viewRef.current;
      if (!view) return;
      const { from, to } = view.state.selection.main;
      const first = view.state.doc.lineAt(from);
      const last = view.state.doc.lineAt(to);
      const changes: Array<{ from: number; to: number; insert: string }> = [];
      for (let n = first.number; n <= last.number; n++) {
        const line = view.state.doc.line(n);
        const cleaned = line.text
          .replace(/^#{1,6}\s+/, '')
          .replace(/^\s*>\s?/, '')
          .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/, '')
          .replace(/^\s*[-*+]\s+/, '')
          .replace(/^\s*\d+\.\s+/, '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
          .replace(/~~(.+?)~~/g, '$1')
          .replace(/==(.+?)==/g, '$1')
          .replace(/`(.+?)`/g, '$1');
        if (cleaned !== line.text) changes.push({ from: line.from, to: line.to, insert: cleaned });
      }
      if (changes.length > 0) view.dispatch({ changes });
      view.focus();
    },

    undo() {
      const view = viewRef.current;
      if (view) { undo(view); view.focus(); }
    },
    redo() {
      const view = viewRef.current;
      if (view) { redo(view); view.focus(); }
    },
    focus() {
      viewRef.current?.focus();
    }
  }), []);

  return <div ref={hostRef} className="vault-cm-host" />;
});

export default MarkdownEditor;
