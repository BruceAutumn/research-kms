import { createContext, useContext } from 'react';
import type { VaultTab } from '../../types';

export interface VaultApi {
  /** 当前打开的笔记 Tab 与活动 Tab */
  tabs: VaultTab[];
  activePath: string | null;
  openNote: (path: string, title: string) => void;
  closeTab: (path: string) => void;
  moveTab: (from: number, to: number) => void;
  togglePinTab: (path: string) => void;
  /** 文件树刷新计数（每次变更 +1，触发重新拉取） */
  treeTick: number;
  refreshTree: () => void;
  /** 请求打开指定笔记（含自动创建流程），供预览/图/反链跳转 */
  requestOpen: (titleOrPath: string) => void;
  /** Outline 跳转：请求编辑器滚动到指定行 */
  scrollRequest: { path: string; line: number; seq: number } | null;
  requestScroll: (path: string, line: number) => void;
  /** Properties 写回后通知编辑器（干净状态时）重新读取文件 */
  propertiesTick: number;
  bumpProperties: () => void;
  /** 编辑器当前文档内容（供 Outline 等面板使用） */
  activeContent: string;
  setActiveContent: (content: string) => void;
  /** 动作总线：Command Palette 请求的动作（模块未挂载时由 pendingAction 兜底） */
  pendingAction: VaultAction | null;
  clearPendingAction: () => void;
}

export const VaultContext = createContext<VaultApi | null>(null);

export function useVault(): VaultApi {
  const ctx = useContext(VaultContext);
  if (!ctx) {
    throw new Error('useVault 必须在 VaultModule 内使用');
  }
  return ctx;
}

// ------------------------------------------------------------------
// 跨模块动作总线：Command Palette（模块外）→ Vault 模块内
// 与 LiteratureContext 同范式：pendingAction 兜底 + CustomEvent。
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
