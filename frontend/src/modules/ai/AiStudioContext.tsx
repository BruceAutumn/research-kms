export type AiActionSource = 'paper' | 'collection' | 'vault-file' | 'vault-folder' | 'manual' | string;

export interface AiContextRef {
  type: AiActionSource;
  id?: number;
  path?: string;
  label?: string;
  count?: number;
  [key: string]: unknown;
}

export interface AiAction {
  type: 'run-agent' | 'new-agent' | 'focus-history';
  source?: AiActionSource;
  instruction?: string;
  contextRefs?: AiContextRef[];
  label?: string;
}

export const AI_ACTION_EVENT = 'kms:ai-action';
const PENDING_ACTION_KEY = 'kms.ai.pendingAction';

export function dispatchAiAction(action: AiAction, navigateToAi = true) {
  try {
    sessionStorage.setItem(PENDING_ACTION_KEY, JSON.stringify(action));
  } catch {
    // sessionStorage can be blocked; CustomEvent still covers mounted AI Studio.
  }
  window.dispatchEvent(new CustomEvent<AiAction>(AI_ACTION_EVENT, { detail: action }));
  if (navigateToAi && window.location.pathname !== '/ai') {
    window.history.pushState({}, '', '/ai');
    window.dispatchEvent(new PopStateEvent('popstate'));
  }
}

export function listenAiAction(listener: (action: AiAction) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<AiAction>).detail);
  window.addEventListener(AI_ACTION_EVENT, handler);
  return () => window.removeEventListener(AI_ACTION_EVENT, handler);
}

export function consumeAiAction(): AiAction | null {
  try {
    const raw = sessionStorage.getItem(PENDING_ACTION_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PENDING_ACTION_KEY);
    const parsed = JSON.parse(raw) as AiAction;
    return parsed && parsed.type ? parsed : null;
  } catch {
    return null;
  }
}
