import { createContext, useContext } from 'react';
import type { Paper } from '../../types';

export type ImportMode = 'pdf' | 'folder' | 'doi' | 'bibtex';

export interface ReaderTab {
  paperId: number;
  title: string;
}

export interface LiteratureApi {
  activeView: string; // 'library' | 'extraction' | `reader:${paperId}`
  readerTabs: ReaderTab[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  searchFocusTick: number;
  openReader: (paper: Paper) => void;
  closeReaderTab: (paperId: number) => void;
  moveReaderTab: (from: number, to: number) => void;
  openLibrary: () => void;
  openExtraction: (paperId?: number) => void;
  openImport: (mode: ImportMode) => void;
  openNewCollection: () => void;
  focusSearch: () => void;
  extractionPaperId: number | null;
}

export const LiteratureContext = createContext<LiteratureApi | null>(null);

export function useLiterature(): LiteratureApi {
  const ctx = useContext(LiteratureContext);
  if (!ctx) {
    throw new Error('useLiterature Must in LiteratureModule used inside');
  }
  return ctx;
}

// ------------------------------------------------------------------
// Cross-module Action Bus: Command Palette(Outside Module)-> Literature In-module Dialog
// Store first when module not mounted pendingAction, consume after mount; on mounted CustomEvent. 
// ------------------------------------------------------------------
export type LiteratureAction =
  | { type: 'import-pdf' }
  | { type: 'new-collection' }
  | { type: 'focus-search' };

const ACTION_EVENT = 'kms:literature-action';

let pendingAction: LiteratureAction | null = null;

export function requestLiteratureAction(action: LiteratureAction): void {
  pendingAction = action;
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: action }));
}

export function consumeLiteratureAction(): LiteratureAction | null {
  const action = pendingAction;
  pendingAction = null;
  return action;
}

export function listenLiteratureAction(handler: (action: LiteratureAction) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail as LiteratureAction);
  window.addEventListener(ACTION_EVENT, listener);
  return () => window.removeEventListener(ACTION_EVENT, listener);
}
