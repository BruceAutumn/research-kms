import { createContext, useContext } from 'react';

export interface ShellApi {
  /** open Command Palette */
  openPalette: () => void;
  /** Open Settings Drawer, Initial partition specifiable(general / ai / vault / extensions / about) */
  openSettings: (section?: string) => void;
  /** Clear All Pane Layout with default widths restored */
  resetLayouts: () => void;
  /** Layout Reset Version: on change Workspace rebuild, Read back default layout */
  layoutResetVersion: number;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell Must in App   ShellContext.Provider used inside');
  }
  return ctx;
}
