import { createContext, useContext } from 'react';
import type { VaultTab } from '../../types';

export interface VaultApi {
  /** currently openNote Tab and activity Tab */
  tabs: VaultTab[];
  activePath: string | null;
  openNote: (path: string, title: string) => void;
  closeTab: (path: string) => void;
  moveTab: (from: number, to: number) => void;
  togglePinTab: (path: string) => void;
  /** File tree refresh count(each change +1, Trigger refetch) */
  treeTick: number;
  refreshTree: () => void;
  /** Request open note(withAutoCreateflow), providePreview/graph/Backlink Jump */
  requestOpen: (titleOrPath: string) => void;
  /** Outline Jump: Request editor scroll to line */
  scrollRequest: { path: string; line: number; seq: number } | null;
  requestScroll: (path: string, line: number) => void;
  /** Properties Notify editor after write back(when clean)Re-read file */
  propertiesTick: number;
  bumpProperties: () => void;
  /** Editor current doc content(provide Outline etc panel uses) */
  activeContent: string;
  setActiveContent: (content: string) => void;
  /** Action Bus: Command Palette Requested action(When module not mounted pendingAction fallback) */
  pendingAction: VaultAction | null;
  clearPendingAction: () => void;
}

export const VaultContext = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error('useVault Must in VaultModule used inside');
  }
  return ctx;
}

// ------------------------------------------------------------------
// Cross-module Action Bus: Command Palette(Outside Module)-> Vault In-module
// and LiteratureContext same paradigm: pendingAction fallback + CustomEvent. 
// ------------------------------------------------------------------
export type VaultAction =
  | { type: 'new-note' }
  | { type: 'new-folder' }
  | { type: 'focus-search' };

const ACTION_EVENT = 'kms:vault-action';

let pendingAction: VaultAction | null = null;

export function requestVaultAction(action: VaultAction): void {
  pendingAction = action;
  window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: action }));
}

export function consumeVaultAction(): VaultAction | null {
  const action = pendingAction;
  pendingAction = null;
  return action;
}

export function listenVaultAction(handler: (action: VaultAction) => void): () => void {
  const listener = (event: Event) => handler((event as CustomEvent).detail as VaultAction);
  window.addEventListener(ACTION_EVENT, listener);
  return () => window.removeEventListener(ACTION_EVENT, listener);
}
