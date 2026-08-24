import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { chatWithAi } from '../../../api/client';
import type { ChatMessage } from '../../../types';

interface PaperChatState {
  messages: ChatMessage[];
  busy: boolean;
  error: string;
}

interface ChatOptions {
  thinking?: boolean;
  webSearch?: boolean;
  effort?: string;
}

const globalStore = new Map<number, PaperChatState>();
const tickListeners = new Set<() => void>();

function getOrCreate(paperId: number): PaperChatState {
  if (!globalStore.has(paperId)) {
    const saved = loadHistory(paperId);
    globalStore.set(paperId, { messages: saved, busy: false, error: '' });
  }
  return globalStore.get(paperId)!;
}

function loadHistory(paperId: number): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`kms.reader.chat.${paperId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ChatMessage[];
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveHistory(paperId: number, messages: ChatMessage[]) {
  try {
    localStorage.setItem(`kms.reader.chat.${paperId}`, JSON.stringify(messages));
  } catch {
    // ignore
  }
}

function notifyAll() {
  tickListeners.forEach((fn) => fn());
}

interface ReaderChatContextValue {
  send: (paperId: number, text: string, context: string, options?: ChatOptions) => void;
}

const ReaderChatContext = createContext<ReaderChatContextValue | null>(null);

export function ReaderChatProvider({ children }: { children: ReactNode }) {
  const send = useCallback((paperId: number, text: string, context: string, options?: ChatOptions) => {
    const prompt = text.trim();
    if (!prompt) return;
    const state = getOrCreate(paperId);
    if (state.busy) return;

    const nextHistory: ChatMessage[] = [...state.messages, { role: 'user' as const, content: prompt }];
    globalStore.set(paperId, { messages: nextHistory, busy: true, error: '' });
    saveHistory(paperId, nextHistory);
    notifyAll();

    chatWithAi(paperId, nextHistory, context, options)
      .then((response) => {
        const current = getOrCreate(paperId);
        const updated = [...current.messages, { role: 'assistant' as const, content: response.reply }];
        globalStore.set(paperId, { messages: updated, busy: false, error: '' });
        saveHistory(paperId, updated);
        notifyAll();
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        const current = getOrCreate(paperId);
        const updated = [...current.messages, { role: 'assistant' as const, content: `（请求失败：${message}）` }];
        globalStore.set(paperId, { messages: updated, busy: false, error: message });
        saveHistory(paperId, updated);
        notifyAll();
      });
  }, []);

  return (
    <ReaderChatContext.Provider value={{ send }}>
      {children}
    </ReaderChatContext.Provider>
  );
}

export function useReaderChat(paperId: number) {
  const ctx = useContext(ReaderChatContext);
  const [, setTick] = useState(0);

  useEffect(() => {
    const listener = () => setTick((t) => t + 1);
    tickListeners.add(listener);
    return () => { tickListeners.delete(listener); };
  }, []);

  const state = getOrCreate(paperId);

  return {
    messages: state.messages,
    busy: state.busy,
    error: state.error,
    send: (text: string, context: string, options?: ChatOptions) => ctx?.send(paperId, text, context, options)
  };
}
