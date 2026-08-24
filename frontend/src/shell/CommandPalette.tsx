import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  BookOpen,
  Bot,
  FilePlus2,
  FileUp,
  FolderPlus,
  FolderTree,
  Highlighter,
  Play,
  Search,
  Settings,
  StickyNote
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useShell } from './ShellContext';
import { requestLiteratureAction } from '../modules/literature/LiteratureContext';
import { requestVaultAction } from '../modules/vault/VaultContext';
import { globalSearch, type GlobalSearchResult } from '../api/client';

interface CommandDef {
  label: string;
  icon: LucideIcon;
  run: () => void;
}

export const COMMAND_PALETTE_SHORTCUTS = [
  { keys: '⌘/Ctrl K', label: '打开命令面板' },
  { keys: '⌘/Ctrl Shift P', label: '打开命令面板' },
  { keys: 'Esc', label: '关闭命令面板' }
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const navigate = useNavigate();
  const { openSettings } = useShell();
  const [searchValue, setSearchValue] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = (path: string) => {
    navigate(path);
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) {
      setSearchValue('');
      setSearchResults(null);
    }
  }, [open]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = searchValue.trim();
    if (q.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await globalSearch(q);
        setSearchResults(results);
      } catch {
        setSearchResults(null);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchValue]);

  const groups: { heading: string; items: CommandDef[] }[] = [
    {
      heading: '导航',
      items: [
        { label: '打开 文献', icon: BookOpen, run: () => go('/literature') },
        { label: '打开 AI Studio', icon: Bot, run: () => go('/ai') },
        { label: '打开 知识库', icon: FolderTree, run: () => go('/vault') }
      ]
    },
    {
      heading: '动作',
      items: [
        {
          label: '导入 PDF',
          icon: FileUp,
          run: () => {
            requestLiteratureAction({ type: 'import-pdf' });
            go('/literature');
          }
        },
        {
          label: '新建笔记',
          icon: FilePlus2,
          run: () => {
            requestVaultAction({ type: 'new-note' });
            go('/vault');
          }
        },
        {
          label: '新建 Vault 文件夹',
          icon: FolderPlus,
          run: () => {
            requestVaultAction({ type: 'new-folder' });
            go('/vault');
          }
        },
        {
          label: '新建 Collection',
          icon: FolderPlus,
          run: () => {
            requestLiteratureAction({ type: 'new-collection' });
            go('/literature');
          }
        },
        { label: '运行 Agent', icon: Play, run: () => go('/ai') }
      ]
    },
    {
      heading: '搜索',
      items: [
        {
          label: '搜索文献',
          icon: Search,
          run: () => {
            requestLiteratureAction({ type: 'focus-search' });
            go('/literature');
          }
        },
        {
          label: '搜索笔记',
          icon: Search,
          run: () => {
            requestVaultAction({ type: 'focus-search' });
            go('/vault');
          }
        }
      ]
    },
    {
      heading: '系统',
      items: [
        {
          label: '打开设置',
          icon: Settings,
          run: () => {
            onOpenChange(false);
            openSettings();
          }
        }
      ]
    }
  ];

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && !event.shiftKey && key === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      } else if ((event.metaKey || event.ctrlKey) && event.shiftKey && key === 'p') {
        event.preventDefault();
        onOpenChange(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  if (!open) return null;

  const hasResults = searchResults && searchResults.totalCount > 0;
  const q = searchValue.trim().toLowerCase();

  return (
    <div className="palette-shell" role="dialog" aria-modal="true" aria-label="Command Palette">
      <div className="palette-overlay" onClick={() => onOpenChange(false)} />
      <Command label="Command Palette" shouldFilter={!!q && q.length >= 2 && !hasResults ? false : true}>
        <Command.Input
          placeholder="输入命令或搜索…"
          value={searchValue}
          onValueChange={setSearchValue}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onOpenChange(false);
          }}
        />
        <Command.List>
          <Command.Empty>
            {searching ? '搜索中…' : '没有匹配的命令'}
          </Command.Empty>

          {hasResults && (
            <>
              {searchResults!.papers.length > 0 && (
                <Command.Group heading={`论文 (${searchResults!.papers.length})`}>
                  {searchResults!.papers.map((p) => (
                    <Command.Item
                      key={`paper-${p.id}`}
                      value={`${q} ${p.title}`}
                      onSelect={() => go(`/literature?paper=${p.id}`)}
                    >
                      <BookOpen size={14} aria-hidden="true" />
                      <span className="palette-search-title">{p.title}</span>
                      {p.year && <span className="palette-search-meta">{p.year}</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searchResults!.notes.length > 0 && (
                <Command.Group heading={`笔记 (${searchResults!.notes.length})`}>
                  {searchResults!.notes.map((n) => (
                    <Command.Item
                      key={`note-${n.path}`}
                      value={`${q} ${n.title}`}
                      onSelect={() => go(`/vault?path=${encodeURIComponent(n.path)}`)}
                    >
                      <StickyNote size={14} aria-hidden="true" />
                      <span className="palette-search-title">{n.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searchResults!.annotations.length > 0 && (
                <Command.Group heading={`标注 (${searchResults!.annotations.length})`}>
                  {searchResults!.annotations.map((a) => (
                    <Command.Item
                      key={`ann-${a.id}`}
                      value={`${q} ${a.snippet ?? ''}`}
                      onSelect={() => go(`/literature?paper=${a.paperId}&ann=${a.id}`)}
                    >
                      <Highlighter size={14} aria-hidden="true" />
                      <span className="palette-search-title">{a.snippet ?? '标注'}</span>
                      <span className="palette-search-meta">p.{a.page}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searchResults!.conversations.length > 0 && (
                <Command.Group heading={`AI 会话 (${searchResults!.conversations.length})`}>
                  {searchResults!.conversations.map((conversation) => (
                    <Command.Item
                      key={`conversation-${conversation.id}`}
                      value={`${q} ${conversation.title} ${conversation.snippet ?? ''}`}
                      onSelect={() => go(`/ai?conversation=${conversation.id}`)}
                    >
                      <Bot size={14} aria-hidden="true" />
                      <span className="palette-search-title">{conversation.title}</span>
                      <span className="palette-search-meta">{conversation.messageCount} 条</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </>
          )}

          {groups.map((group) => (
            <Command.Group key={group.heading} heading={group.heading}>
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <Command.Item key={item.label} value={item.label} onSelect={() => item.run()}>
                    <Icon size={14} aria-hidden="true" />
                    <span>{item.label}</span>
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>
      </Command>
    </div>
  );
}
