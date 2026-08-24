import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import AgentSidebar from './ai/AgentSidebar';
import ChatPane, { type ChatBubble, type ChatSource } from './ai/ChatPane';
import Composer from './ai/Composer';
import ContextBar from './ai/ContextBar';
import AiSidePanel from './ai/AiSidePanel';
import AiHome from './ai/AiHome';
import WorkPane from './ai/WorkPane';
import { connectWorkRun, postChatStream } from '../api/sseClient';
import {
  answerRunPermission,
  cancelRun,
  createRun,
  deleteConversation,
  getConversation,
  getRun,
  listAgents,
  listConversations,
  listLlmModels,
  listRuns,
  listTools
} from '../api/client';
import type { Agent, AgentRun, AgentRunStep, AiConversation, AiAttachment } from '../types';
import { consumeAiAction, listenAiAction, type AiAction, type AiContextRef } from './ai/AiStudioContext';

export default function AiStudioModule() {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<'chat' | 'work'>('chat');
  const [input, setInput] = useState('');
  const [selectedAgentId, setSelectedAgentId] = useState<number>();
  const [selectedModelId, setSelectedModelId] = useState<number>();
  const [contextRefs, setContextRefs] = useState<AiContextRef[]>([]);
  const [contextPickerOpen, setContextPickerOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatBubble[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number>();
  const [workSteps, setWorkSteps] = useState<AgentRunStep[]>([]);
  const [activeRunId, setActiveRunId] = useState<number>();
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<Record<string, unknown> | null>(null);
  const [thinking, setThinking] = useState(false);
  const [webSearch, setWebSearch] = useState(false);
  const [effort, setEffort] = useState<'low' | 'medium' | 'high'>('medium');
  const [attachments, setAttachments] = useState<AiAttachment[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const agentsQuery = useQuery({ queryKey: ['agents'], queryFn: listAgents });
  const modelsQuery = useQuery({ queryKey: ['llm-models'], queryFn: listLlmModels });
  const toolsQuery = useQuery({ queryKey: ['tools'], queryFn: listTools });
  const runsQuery = useQuery({ queryKey: ['runs'], queryFn: listRuns, refetchInterval: running ? 3000 : false });
  const conversationsQuery = useQuery({ queryKey: ['ai-conversations'], queryFn: listConversations });

  const agents = agentsQuery.data || [];
  const models = modelsQuery.data || [];
  const runs = runsQuery.data || [];
  const conversations = conversationsQuery.data || [];
  const tools = toolsQuery.data || [];
  const selectedAgent = useMemo(() => agents.find((agent) => agent.id === selectedAgentId) || agents[0], [agents, selectedAgentId]);

  useEffect(() => {
    if (!selectedAgentId && agents[0]) setSelectedAgentId(agents[0].id);
  }, [agents, selectedAgentId]);

  useEffect(() => {
    setSelectedModelId((old) => old ?? models.find((model) => model.isDefault)?.id ?? models[0]?.id);
  }, [models]);

  useEffect(() => {
    const applyAction = (action: AiAction) => {
      if (action.type === 'new-agent') {
        setMode('chat');
        setChatMessages([]);
        setActiveConversationId(undefined);
        setWorkSteps([]);
      }
      if (action.type === 'focus-history') setMode('work');
      if (action.type === 'run-agent') {
        setMode('work');
        setInput(action.instruction || (action.label ? `Please analyze: ${action.label}` : 'Perform research assistant task on context. '));
        setContextRefs(action.contextRefs || []);
      }
    };
    const pending = consumeAiAction();
    if (pending) applyAction(pending);
    return listenAiAction(applyAction);
  }, []);

  useEffect(() => () => {
    abortRef.current?.abort();
    eventSourceRef.current?.close();
  }, []);

  async function send() {
    if (!input.trim() || running) return;
    setError(null);
    setRunning(true);
    if (mode === 'chat') await sendChat();
    else await sendWork();
  }

  async function sendChat() {
    const user: ChatBubble = { role: 'user', content: input.trim() };
    setChatMessages((old) => [...old, user, { role: 'assistant', content: '' }]);
    setInput('');
    const controller = new AbortController();
    abortRef.current = controller;
    await postChatStream({
      conversationId: activeConversationId,
      modelId: selectedModelId,
      messages: [{ role: 'user', content: user.content }],
      contextRefs,
      thinking,
      webSearch,
      effort
    }, {
      onToken: (delta) => setChatMessages((old) => old.map((msg, index) => index === old.length - 1 ? { ...msg, content: msg.content + delta } : msg)),
      onDone: (payload) => {
        if (typeof payload.conversationId === 'number') setActiveConversationId(payload.conversationId);
        const sources = Array.isArray(payload.sources) ? (payload.sources as ChatSource[]) : undefined;
        if (sources) {
          setChatMessages((old) => old.map((msg, index) => index === old.length - 1 ? { ...msg, sources } : msg));
        }
        setRunning(false);
        void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      },
      onError: (payload) => {
        if (typeof payload.conversationId === 'number') setActiveConversationId(payload.conversationId);
        setError(payload);
        setRunning(false);
        void queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
      }
    }, controller.signal).catch((err) => {
      if (!controller.signal.aborted) setError({ code: 'NETWORK', message: err instanceof Error ? err.message : String(err) });
      setRunning(false);
    });
  }

  async function sendWork() {
    setActiveConversationId(undefined);
    const payload = await createRun({
      instruction: input.trim(),
      agentId: selectedAgent?.id,
      llmModelId: selectedModelId,
      contextRefs
    });
    setInput('');
    setActiveRunId(payload.runId);
    setWorkSteps([]);
    eventSourceRef.current?.close();
    eventSourceRef.current = connectWorkRun(payload.runId, {
      onStep: (step) => setWorkSteps((old) => old.some((item) => item.id === step.id) ? old : [...old, step]),
      onDone: () => { setRunning(false); void queryClient.invalidateQueries({ queryKey: ['runs'] }); },
      onError: (payload) => { setError(payload); setRunning(false); void queryClient.invalidateQueries({ queryKey: ['runs'] }); }
    });
  }

  async function stop() {
    abortRef.current?.abort();
    eventSourceRef.current?.close();
    if (activeRunId) await cancelRun(activeRunId).catch(() => undefined);
    setRunning(false);
  }

  async function selectRun(run: AgentRun) {
    setMode('work');
    setActiveRunId(run.id);
    const detail = await getRun(run.id);
    setWorkSteps(detail.steps || []);
  }

  async function selectConversation(conversation: AiConversation) {
    abortRef.current?.abort();
    eventSourceRef.current?.close();
    setRunning(false);
    setError(null);
    setMode('chat');
    setActiveConversationId(conversation.id);
    setActiveRunId(undefined);
    const detail = await getConversation(conversation.id);
    setChatMessages(detail.messages.filter((message) => message.role === 'user' || message.role === 'assistant') as ChatBubble[]);
  }

  async function removeConversation(conversation: AiConversation) {
    if (!window.confirm(`Delete Chat"${conversation.title || 'Unnamed Chat'}"? `)) return;
    await deleteConversation(conversation.id);
    if (activeConversationId === conversation.id) {
      setActiveConversationId(undefined);
      setChatMessages([]);
    }
    await queryClient.invalidateQueries({ queryKey: ['ai-conversations'] });
  }


  function newChat() {
    abortRef.current?.abort();
    eventSourceRef.current?.close();
    setRunning(false);
    setMode('chat');
    setError(null);
    setActiveConversationId(undefined);
    setActiveRunId(undefined);
    setChatMessages([]);
    setWorkSteps([]);
  }

  return (
    <div className="ai2-root">
      <AgentSidebar
        conversations={conversations}
        activeConversationId={activeConversationId}
        onSelectConversation={selectConversation}
        onDeleteConversation={removeConversation}
        onNewChat={newChat}
        onSettings={() => { window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}
      />
      <main className="ai2-main">
        <div className="ai2-topbar">
          <span className="ai2-topbar-title">AI Chat</span>
          <div className="ai2-tabs"><button className={mode === 'chat' ? 'is-active' : ''} onClick={() => setMode('chat')}>Chat</button><button className={mode === 'work' ? 'is-active' : ''} onClick={() => setMode('work')}>Work</button></div>
        </div>
        {mode === 'chat'
          ? (chatMessages.length === 0
              ? <AiHome conversations={conversations} onSelect={selectConversation} onPrompt={(text) => { setInput(text); }} />
              : <ChatPane messages={chatMessages} streaming={running} error={error} />)
          : <WorkPane steps={workSteps} error={error} runId={activeRunId} onApprove={async (rid, allow, alwaysAllow) => { await answerRunPermission(rid, allow, alwaysAllow); }} />}
        {models.length === 0 && <button className="ai2-no-model" onClick={() => { window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}>Model not configured . Go to Settings</button>}
        {/* Context chips put atInputright above: See what is fed before send.  */}
        <ContextBar
          refs={contextRefs}
          onChange={setContextRefs}
          contextWindow={models.find((m) => m.id === selectedModelId)?.contextWindow}
          pickerOpen={contextPickerOpen}
          onPickerOpenChange={setContextPickerOpen}
        />
        <Composer
          mode={mode}
          value={input}
          running={running}
          models={models}
          modelId={selectedModelId}
          disabled={models.length === 0}
          thinking={thinking}
          webSearch={webSearch}
          effort={effort}
          attachments={attachments}
          onMode={setMode}
          onChange={setInput}
          onSend={send}
          onStop={stop}
          onModel={setSelectedModelId}
          onManageModels={() => { window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}
          onAddContext={() => setContextPickerOpen(true)}
          onThinkingChange={setThinking}
          onWebSearchChange={setWebSearch}
          onEffortChange={setEffort}
          onAttachmentsChange={setAttachments}
        />
      </main>
      <AiSidePanel
        contextRefs={contextRefs}
        onContextChange={setContextRefs}
        models={models}
        modelId={selectedModelId}
        onManageModels={() => { window.history.pushState({}, '', '/settings/models'); window.dispatchEvent(new PopStateEvent('popstate')); }}
        agentPrompt={agentsQuery.data?.find((a) => a.id === selectedAgentId)?.prompt}
        agentName={agentsQuery.data?.find((a) => a.id === selectedAgentId)?.name}
      />
    </div>
  );
}
