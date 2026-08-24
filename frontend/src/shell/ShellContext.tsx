import { createContext, useContext } from 'react';

export interface ShellApi {
  /** 打开 Command Palette */
  openPalette: () => void;
  /** 打开设置抽屉，可指定初始分区（general / ai / vault / extensions / about） */
  openSettings: (section?: string) => void;
  /** 清除所有 Pane 布局并恢复默认宽度 */
  resetLayouts: () => void;
  /** 布局重置版本号：变化时 Workspace 重建，读回默认布局 */
  layoutResetVersion: number;
}

export const ShellContext = createContext<ShellApi | null>(null);

export function useShell(): ShellApi {
  const ctx = useContext(ShellContext);
  if (!ctx) {
    throw new Error('useShell 必须在 App 的 ShellContext.Provider 内使用');
  }
  return ctx;
}
