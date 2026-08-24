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
  { keys: 'Cmd/Ctrl K', label: 'Open Command Palette' },
  { keys: 'Cmd/Ctrl Shift P', label: 'Open Command Palette' },
  { keys: 'Esc', label: 'Close Command Palette' }
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
      heading: 'Navigation',
      items: [
        { label: 'open Paper', icon: BookOpen, run: () => go('/literature') },
        { label: 'open AI Studio', icon: Bot, run: () => go('/ai') },
        { label: 'open Vault', icon: FolderTree, run: () => go('/vault') }
      ]
    },
    {
      heading: 'Action',
      items: [
        {
          label: 'import PDF',
          icon: FileUp,
          run: () => {
            requestLiteratureAction({ type: 'import-pdf' });
            go('/literature');
          }
        },
        {
          label: 'New Note',
          icon: FilePlus2,
          run: () => {
            requestVaultAction({ type: 'new-note' });
            go('/vault');
          }
        },
        {
          label: 'New Vault Folder',
          icon: FolderPlus,
          run: () => {
            requestVaultAction({ type: 'new-folder' });
            go('/vault');
          }
        },
        {
          label: 'New Collection',
          icon: FolderPlus,
          run: () => {
            requestLiteratureAction({ type: 'new-collection' });
            go('/literature');
          }
        },
        { label: 'Run Agent', icon: Play, run: () => go('/ai') }
      ]
    },
    {
      heading: 'search',
      items: [
        {
          label: 'Search Papers',
          icon: Search,
          run: () => {
            requestLiteratureAction({ type: 'focus-search' });
            go('/literature');
          }
        },
        {
          label: 'Search Notes',
          icon: Search,
          run: () => {
            requestVaultAction({ type: 'focus-search' });
            go('/vault');
          }
        }
      ]
    },
    {
      heading: 'system',
      items: [
        {
          label: 'Open Settings',
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
          placeholder="Type a command or search..."
          value={searchValue}
          onValueChange={setSearchValue}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onOpenChange(false);
          }}
        />
        <Command.List>
          <Command.Empty>
            {searching ? 'Searching...' : 'noMatchcommand'}
          </Command.Empty>

          {hasResults && (
            <>
              {searchResults!.papers.length > 0 && (
                <Command.Group heading={`Paper (${searchResults!.papers.length})`}>
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
                <Command.Group heading={`Note (${searchResults!.notes.length})`}>
                  {searchResults!.notes.map((n) => (
                    <Command.Item
                      key={`note-${n.id}`}
                      value={`${q} ${n.title}`}
                      onSelect={() => go(`/vault?note=${n.id}`)}
                    >
                      <StickyNote size={14} aria-hidden="true" />
                      <span className="palette-search-title">{n.title}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {searchResults!.annotations.length > 0 && (
                <Command.Group heading={`Annotation (${searchResults!.annotations.length})`}>
                  {searchResults!.annotations.map((a) => (
                    <Command.Item
                      key={`ann-${a.id}`}
                      value={`${q} ${a.snippet ?? ''}`}
                      onSelect={() => go(`/literature?paper=${a.paperId}&page=${a.page}`)}
                    >
                      <Highlighter size={14} aria-hidden="true" />
                      <span className="palette-search-title">{a.snippet ?? 'Annotation'}</span>
                      <span className="palette-search-meta">p.{a.page}</span>
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
