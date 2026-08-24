import type { AgentRunStep } from '../types';

export interface SseHandlers {
  onStep?: (step: AgentRunStep) => void;
  onToken?: (delta: string) => void;
  onDone?: (payload: Record<string, unknown>) => void;
  onError?: (payload: Record<string, unknown>) => void;
}

const WORK_EVENTS = [
  'run.started',
  'step.started',
  'step.progress',
  'step.completed',
  'step.failed',
  'permission.required',
  'permission.granted',
  'permission.denied',
  'run.completed',
  'run.failed'
];

export function connectWorkRun(runId: number, handlers: SseHandlers): EventSource {
  const source = new EventSource(`/api/runs/${runId}/stream`);
  const stepHandler = (event: MessageEvent) => handlers.onStep?.(JSON.parse(event.data) as AgentRunStep);
  for (const type of WORK_EVENTS) source.addEventListener(type, stepHandler as EventListener);
  source.addEventListener('done', ((event: MessageEvent) => {
    handlers.onDone?.(parseData(event.data));
    source.close();
  }) as EventListener);
  source.addEventListener('error', ((event: MessageEvent) => {
    if (event.data) {
      handlers.onError?.(parseData(event.data));
      source.close();
    }
  }) as EventListener);
  return source;
}

export async function postChatStream(
  body: Record<string, unknown>,
  handlers: SseHandlers,
  signal?: AbortSignal
): Promise<void> {
  const response = await fetch('/api/ai/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  });
  if (!response.ok || !response.body) {
    handlers.onError?.({ code: `HTTP_${response.status}`, httpStatus: response.status, message: await response.text() });
    return;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf('\n\n');
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      dispatchFrame(frame, handlers);
      boundary = buffer.indexOf('\n\n');
    }
  }
}

function dispatchFrame(frame: string, handlers: SseHandlers) {
  let event = 'message';
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trim());
  }
  const payload = parseData(data.join('\n'));
  if (event === 'token') handlers.onToken?.(String(payload.delta ?? ''));
  if (event === 'done') handlers.onDone?.(payload);
  if (event === 'error') handlers.onError?.(payload);
}

function parseData(raw: string): Record<string, unknown> {
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return { message: raw };
  }
}
