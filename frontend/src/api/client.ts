import axios from 'axios';
import type {
  Agent,
  AgentRequest,
  AgentRunRequest,
  AgentStepEvent,
  AiConversation,
  AiConversationDetail,
  AiExtractionRow,
  Annotation,
  BacklinkRow,
  ChatMessage,
  ChatResponse,
  Collection,
  CreateNoteResult,
  ExtractResponse,
  GraphData,
  ImportBibtexResult,
  MetadataField,
  MetadataSaveResult,
  ModelConfig,
  ModelConfigRequest,
  ModelTestResult,
  LlmModel,
  LlmModelRequest,
  LlmProvider,
  LlmProviderRequest,
  LlmProviderTestResult,
  ToolInfo,
  AgentPromptVersion,
  Workflow,
  WorkflowStep,
  AgentRun,
  AgentRunStep,
  Note,
  NoteFile,
  OutgoingLinkRow,
  Paper,
  PluginInfo,
  RenameResult,
  SaveResult,
  SearchResultRow,
  Settings,
  SystemAbout,
  TableRow,
  VaultInfo,
  SaveConflictError,
  VaultTreeNode
} from '../types';

/**
 * Web 开发环境默认通过同源 /api 反向代理访问后端。
 * Tauri/Android 打包时必须显式提供 HTTPS 后端地址，例如：
 * VITE_API_BASE_URL=https://api.example.com/api
 */
export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60_000
});

/**
 * 从 409 响应里取出冲突详情。
 *
 * 必须有这一步：axios 抛的是 AxiosError，响应体在 error.response.data 里。
 * 直接 `err as SaveConflictError` 拿到的 conflict 恒为 undefined ——
 * EditorPane 的冲突对话框此前就是因此从来没弹出过。
 */
export function asSaveConflict(error: unknown): SaveConflictError | null {
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    const data = error.response.data as SaveConflictError | undefined;
    if (data && typeof data.serverContent === 'string') return data;
  }
  return null;
}

export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: string } | undefined;
    return data?.error || error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function uploadPaper(file: File): Promise<Paper> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<Paper>('/papers/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

export async function listPapers(q = '', tag = '', filter = ''): Promise<Paper[]> {
  const { data } = await api.get<Paper[]>('/papers', { params: { q, tag, filter } });
  return data;
}

export async function getPaper(id: number): Promise<Paper> {
  const { data } = await api.get<Paper>(`/papers/${id}`);
  return data;
}

export async function updatePaper(id: number, patch: Partial<Paper>): Promise<Paper> {
  const { data } = await api.patch<Paper>(`/papers/${id}`, patch);
  return data;
}

export async function deletePaper(id: number): Promise<void> {
  await api.delete(`/papers/${id}`);
}

export async function markPaperOpened(id: number): Promise<Paper> {
  const { data } = await api.post<Paper>(`/papers/${id}/opened`);
  return data;
}

export async function getRelatedPapers(id: number): Promise<Paper[]> {
  const { data } = await api.get<Paper[]>(`/papers/${id}/related`);
  return data;
}

// ---------------------------------------------------------------- Collections

export async function listCollections(): Promise<Collection[]> {
  const { data } = await api.get<Collection[]>('/collections');
  return data;
}

export async function createCollection(payload: { name: string; parentId?: number | null }): Promise<Collection> {
  const { data } = await api.post<Collection>('/collections', payload);
  return data;
}

export async function updateCollection(
  id: number,
  payload: { name?: string; parentId?: number | null }
): Promise<Collection> {
  const { data } = await api.patch<Collection>(`/collections/${id}`, payload);
  return data;
}

export async function reorderCollections(
  items: Array<{ id: number; parentId: number | null; sortOrder: number }>
): Promise<void> {
  await api.post('/collections/reorder', { items });
}

export async function deleteCollection(id: number): Promise<void> {
  await api.delete(`/collections/${id}`);
}

export async function listCollectionPapers(id: number): Promise<Paper[]> {
  const { data } = await api.get<Paper[]>(`/collections/${id}/papers`);
  return data;
}

export async function addPapersToCollection(id: number, paperIds: number[]): Promise<Paper[]> {
  const { data } = await api.post<Paper[]>(`/collections/${id}/papers`, { paperIds });
  return data;
}

export async function removePaperFromCollection(id: number, paperId: number): Promise<void> {
  await api.delete(`/collections/${id}/papers/${paperId}`);
}

// ---------------------------------------------------------------- Annotations

export async function listAnnotations(paperId: number): Promise<Annotation[]> {
  const { data } = await api.get<Annotation[]>('/annotations', { params: { paperId } });
  return data;
}

export async function listAllAnnotations(): Promise<Annotation[]> {
  const { data } = await api.get<Annotation[]>('/annotations');
  return data;
}

export async function createAnnotation(payload: {
  paperId: number;
  page: number;
  /** 两个坐标字段都要写：position 是 legacy 前端读的，rectsJson 是后端工具读的。 */
  position?: string;
  rectsJson?: string;
  selectedText?: string;
  color?: string;
  comment?: string;
}): Promise<Annotation> {
  const { data } = await api.post<Annotation>('/annotations', payload);
  return data;
}

export async function updateAnnotation(
  id: number,
  payload: Partial<{ page: number; position: string; selectedText: string; color: string; comment: string }>
): Promise<Annotation> {
  const { data } = await api.patch<Annotation>(`/annotations/${id}`, payload);
  return data;
}

export async function deleteAnnotation(id: number): Promise<void> {
  await api.delete(`/annotations/${id}`);
}

// ---------------------------------------------------------------- Import

export async function importByDoi(doi: string): Promise<Paper> {
  const { data } = await api.post<Paper>('/literature/import/doi', { doi });
  return data;
}

export async function importBibtex(text: string): Promise<ImportBibtexResult> {
  const { data } = await api.post<ImportBibtexResult>('/literature/import/bibtex', { text });
  return data;
}

// ---------------------------------------------------------------- AI Extraction（持久化 + 可追溯）

export async function listExtractions(paperId: number): Promise<AiExtractionRow[]> {
  const { data } = await api.get<AiExtractionRow[]>(`/extractions/paper/${paperId}`);
  return data;
}

export async function acceptExtraction(id: number): Promise<AiExtractionRow> {
  const { data } = await api.post<AiExtractionRow>(`/extractions/${id}/accept`);
  return data;
}

export async function rejectExtraction(id: number): Promise<AiExtractionRow> {
  const { data } = await api.post<AiExtractionRow>(`/extractions/${id}/reject`);
  return data;
}

export async function editExtraction(id: number, userValue: string): Promise<AiExtractionRow> {
  const { data } = await api.post<AiExtractionRow>(`/extractions/${id}/edit`, { userValue });
  return data;
}

export async function acceptAllExtractions(paperId: number): Promise<AiExtractionRow[]> {
  const { data } = await api.post<AiExtractionRow[]>(`/extractions/paper/${paperId}/accept-all`);
  return data;
}

export function paperFileUrl(id: number): string {
  return apiUrl(`/papers/${id}/file`);
}

export async function getPaperMetadata(id: number): Promise<MetadataField[]> {
  const { data } = await api.get<MetadataField[]>(`/papers/${id}/metadata`);
  return data;
}

export async function replacePaperMetadata(id: number, fields: MetadataField[]): Promise<MetadataSaveResult> {
  const { data } = await api.put<MetadataSaveResult>(`/papers/${id}/metadata`, fields);
  return data;
}

export async function extractPaperMetadata(id: number): Promise<ExtractResponse> {
  const { data } = await api.post<ExtractResponse>(`/papers/${id}/extract`);
  return data;
}

export async function createPaperNote(id: number, payload?: { content?: string; folder?: string; filename?: string; conflictStrategy?: string }): Promise<Note> {
  const { data } = await api.post<Note>(`/papers/${id}/note`, payload || {});
  return data;
}

export interface NoteTemplate {
  id: number;
  name: string;
  scope: string;
  body: string;
  isDefault: boolean;
  isBuiltin: boolean;
  sortOrder: number;
}

export interface NotePreviewResult {
  renderedMarkdown: string;
  suggestedPath: string;
  aiPlaceholders: string[];
  warnings: string[];
}

export async function listNoteTemplates(scope = 'paper'): Promise<NoteTemplate[]> {
  const { data } = await api.get<NoteTemplate[]>('/note-templates', { params: { scope } });
  return data;
}

export async function previewPaperNote(paperId: number, templateId: number, resolveAi: boolean): Promise<NotePreviewResult> {
  const { data } = await api.post<NotePreviewResult>(`/papers/${paperId}/note/preview`, { templateId, resolveAi });
  return data;
}

export async function getPaperNotes(paperId: number): Promise<Note[]> {
  const { data } = await api.get<Note[]>(`/papers/${paperId}/notes`);
  return data;
}

/**
 * 只改正文的保存。
 *
 * 原来打的是 PUT /notes/{id}，但后端 NoteRequest.title 有 @NotBlank，
 * 只传 content 永远 400 —— Notes tab 的自动保存从来没成功过一次。
 * 现在走 PATCH /notes/{id}/content，并带乐观锁 version：
 * version 不匹配会拿到 409 + serverContent + serverVersion，由调用方给用户三选一。
 */
export async function updateNoteContent(id: number, content: string, version?: number): Promise<Note> {
  const { data } = await api.patch<Note>(`/notes/${id}/content`, { content, version });
  return data;
}

export async function getPaperAnnotations(paperId: number): Promise<Annotation[]> {
  const { data } = await api.get<Annotation[]>(`/papers/${paperId}/annotations`);
  return data;
}

export async function createPaperAnnotation(paperId: number, payload: Partial<Annotation>): Promise<Annotation> {
  const { data } = await api.post<Annotation>(`/papers/${paperId}/annotations`, payload);
  return data;
}


export async function exportAnnotationsToNote(paperId: number, noteId?: number): Promise<Note> {
  const { data } = await api.post<Note>(`/papers/${paperId}/annotations/export-to-note`, noteId ? { noteId } : {});
  return data;
}

export interface AiContextBlock {
  type: string;
  id?: number;
  title?: string;
  text: string;
  tokenEstimate: number;
}

export interface AiContextResolveResult {
  blocks: AiContextBlock[];
  totalTokens: number;
}

export async function resolveAiContext(refs: Array<{ type: string; id?: number; value?: string }>): Promise<AiContextResolveResult> {
  const { data } = await api.post<AiContextResolveResult>('/ai/context/resolve', { refs });
  return data;
}

export async function suggestAiContext(q: string, types = 'paper,note,tag'): Promise<{ items: Array<{ type: string; id: number; label: string }> }> {
  const { data } = await api.get('/ai/context/suggest', { params: { q, types } });
  return data;
}

export async function listNotes(q = ''): Promise<Note[]> {
  const { data } = await api.get<Note[]>('/notes', { params: { q } });
  return data;
}

export async function createNote(payload: { title: string; content: string; properties?: Record<string, unknown>; paperId?: number }): Promise<Note> {
  const { data } = await api.post<Note>('/notes', payload);
  return data;
}

export async function getNote(id: number): Promise<Note> {
  const { data } = await api.get<Note>(`/notes/${id}`);
  return data;
}

export async function updateNote(id: number, payload: { title: string; content: string; properties?: Record<string, unknown>; paperId?: number }): Promise<Note> {
  const { data } = await api.put<Note>(`/notes/${id}`, payload);
  return data;
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}`);
}

export async function getBacklinks(id: number): Promise<Note[]> {
  const { data } = await api.get<Note[]>(`/notes/${id}/backlinks`);
  return data;
}

export async function getNoteByTitle(title: string): Promise<Note> {
  const { data } = await api.get<Note>(`/notes/by-title/${encodeURIComponent(title)}`);
  return data;
}

export async function chatWithAi(
  paperId: number | undefined,
  messages: ChatMessage[],
  context?: string,
  options?: { thinking?: boolean; webSearch?: boolean; effort?: string }
): Promise<ChatResponse> {
  const { data } = await api.post<ChatResponse>('/ai/chat', { paperId, messages, context, ...options });
  return data;
}

export async function listConversations(): Promise<AiConversation[]> {
  const { data } = await api.get<AiConversation[]>('/ai/conversations');
  return data;
}

export async function getConversation(id: number): Promise<AiConversationDetail> {
  const { data } = await api.get<AiConversationDetail>(`/ai/conversations/${id}`);
  return data;
}

export async function deleteConversation(id: number): Promise<void> {
  await api.delete(`/ai/conversations/${id}`);
}

export async function getLlmSettings(): Promise<Settings> {
  const { data } = await api.get<Settings>('/settings/llm');
  return data;
}

export async function getLlmStatus(): Promise<{ mock: boolean }> {
  const { data } = await api.get<{ mock: boolean }>('/settings/llm/status');
  return data;
}

export async function updateLlmSettings(payload: Settings): Promise<Settings> {
  const { data } = await api.put<Settings>('/settings/llm', payload);
  return data;
}

export async function listModels(): Promise<ModelConfig[]> {
  const { data } = await api.get<ModelConfig[]>('/models');
  return data;
}

export async function createModel(payload: ModelConfigRequest): Promise<ModelConfig> {
  const { data } = await api.post<ModelConfig>('/models', payload);
  return data;
}

export async function updateModel(id: number, payload: ModelConfigRequest): Promise<ModelConfig> {
  const { data } = await api.patch<ModelConfig>(`/models/${id}`, payload);
  return data;
}

export async function setDefaultModel(id: number): Promise<ModelConfig> {
  const { data } = await api.post<ModelConfig>(`/models/${id}/default`);
  return data;
}

export async function testModel(id: number): Promise<ModelTestResult> {
  const { data } = await api.post<ModelTestResult>(`/models/${id}/test`);
  return data;
}

export async function listLlmProviders(): Promise<LlmProvider[]> {
  const { data } = await api.get<LlmProvider[]>('/llm/providers');
  return data;
}

export async function createLlmProvider(payload: LlmProviderRequest): Promise<LlmProvider> {
  const { data } = await api.post<LlmProvider>('/llm/providers', payload);
  return data;
}

export async function updateLlmProvider(id: number, payload: LlmProviderRequest): Promise<LlmProvider> {
  const { data } = await api.patch<LlmProvider>(`/llm/providers/${id}`, payload);
  return data;
}

export async function deleteLlmProvider(id: number): Promise<void> {
  await api.delete(`/llm/providers/${id}`);
}

export async function testLlmProvider(id: number): Promise<LlmProviderTestResult> {
  const { data } = await api.post<LlmProviderTestResult>(`/llm/providers/${id}/test`);
  return data;
}

export async function listRemoteLlmModels(id: number): Promise<Array<{ modelId: string; displayName: string }>> {
  const { data } = await api.get<Array<{ modelId: string; displayName: string }>>(`/llm/providers/${id}/models/remote`);
  return data;
}

export async function listLlmModels(): Promise<LlmModel[]> {
  const { data } = await api.get<LlmModel[]>('/llm/models');
  return data;
}

export async function createLlmModel(payload: LlmModelRequest): Promise<LlmModel> {
  const { data } = await api.post<LlmModel>('/llm/models', payload);
  return data;
}

export async function updateLlmModel(id: number, payload: LlmModelRequest): Promise<LlmModel> {
  const { data } = await api.patch<LlmModel>(`/llm/models/${id}`, payload);
  return data;
}

export async function deleteLlmModel(id: number): Promise<void> {
  await api.delete(`/llm/models/${id}`);
}

export async function setDefaultLlmModel(id: number): Promise<LlmModel> {
  const { data } = await api.post<LlmModel>(`/llm/models/${id}/default`);
  return data;
}

export async function listTools(): Promise<ToolInfo[]> {
  const { data } = await api.get<ToolInfo[]>('/tools');
  return data;
}

export async function updateLlmSettingsLegacy(payload: Settings): Promise<Settings> {
  return updateLlmSettings(payload);
}

export async function listAgents(): Promise<Agent[]> {
  const { data } = await api.get<Agent[]>('/agents');
  return data;
}

export async function createAgent(payload: AgentRequest): Promise<Agent> {
  const { data } = await api.post<Agent>('/agents', payload);
  return data;
}

export async function updateAgent(id: number, payload: AgentRequest): Promise<Agent> {
  const { data } = await api.put<Agent>(`/agents/${id}`, payload);
  return data;
}

export async function duplicateAgent(id: number): Promise<Agent> {
  const { data } = await api.post<Agent>(`/agents/${id}/duplicate`);
  return data;
}

export async function listAgentPromptVersions(id: number): Promise<AgentPromptVersion[]> {
  const { data } = await api.get<AgentPromptVersion[]>(`/agents/${id}/prompt-versions`);
  return data;
}

export async function rollbackAgentPrompt(id: number, version: number): Promise<Agent> {
  const { data } = await api.post<Agent>(`/agents/${id}/prompt-versions/${version}/rollback`);
  return data;
}

export async function deleteAgent(id: number): Promise<void> {
  await api.delete(`/agents/${id}`);
}

export async function listPlugins(): Promise<PluginInfo[]> {
  const { data } = await api.get<PluginInfo[]>('/plugins');
  return data;
}

export async function listWorkflows(): Promise<Workflow[]> {
  const { data } = await api.get<Workflow[]>('/workflows');
  return data;
}

export async function createWorkflow(payload: Partial<Workflow>): Promise<Workflow> {
  const { data } = await api.post<Workflow>('/workflows', payload);
  return data;
}

export async function updateWorkflow(id: number, payload: Partial<Workflow>): Promise<Workflow> {
  const { data } = await api.patch<Workflow>(`/workflows/${id}`, payload);
  return data;
}

export async function updateWorkflowSteps(id: number, steps: WorkflowStep[]): Promise<Workflow> {
  const { data } = await api.patch<Workflow>(`/workflows/${id}/steps`, steps);
  return data;
}

export async function deleteWorkflow(id: number): Promise<void> {
  await api.delete(`/workflows/${id}`);
}

export async function createRun(request: AgentRunRequest): Promise<{ runId: number }> {
  const { data } = await api.post<{ runId: number }>('/runs', request);
  return data;
}

export async function listRuns(): Promise<AgentRun[]> {
  const { data } = await api.get<AgentRun[]>('/runs');
  return data;
}

export async function getRun(id: number): Promise<AgentRun> {
  const { data } = await api.get<AgentRun>(`/runs/${id}`);
  return data;
}

export async function answerRunPermission(id: number, allow: boolean, alwaysAllow = false): Promise<Record<string, unknown>> {
  const { data } = await api.post<Record<string, unknown>>(`/runs/${id}/permission`, { allow, alwaysAllow });
  return data;
}

export async function cancelRun(id: number): Promise<void> {
  await api.post(`/runs/${id}/cancel`);
}

export async function deleteRuns(params: { status?: string; before?: string }): Promise<{ runsDeleted: number; stepsDeleted: number }> {
  const { data } = await api.delete<{ runsDeleted: number; stepsDeleted: number }>('/runs', { params });
  return data;
}

export async function getSystemAbout(): Promise<SystemAbout> {
  const { data } = await api.get<SystemAbout>('/system/about');
  return data;
}

export function connectRunStream(id: number, onEvent: (event: AgentRunStep) => void): EventSource {
  const source = new EventSource(apiUrl(`/runs/${id}/stream`));
  const handler = (event: MessageEvent) => onEvent(JSON.parse(event.data) as AgentRunStep);
  for (const type of ['run.started', 'step.started', 'step.progress', 'step.completed', 'step.failed', 'permission.required', 'permission.granted', 'permission.denied', 'run.completed', 'run.failed']) {
    source.addEventListener(type, handler as EventListener);
  }
  return source;
}

// ================================================================
// Phase 4: Knowledge Vault API
// ================================================================

export async function getVaultInfo(): Promise<VaultInfo> {
  const { data } = await api.get<VaultInfo>('/vault/info');
  return data;
}

export async function getVaultTree(): Promise<VaultTreeNode> {
  const { data } = await api.get<VaultTreeNode>('/vault/tree');
  return data;
}

export async function reindexVault(): Promise<Record<string, unknown>> {
  const { data } = await api.post<Record<string, unknown>>('/vault/reindex');
  return data;
}

export async function rescanVault(): Promise<Record<string, unknown>> {
  const { data } = await api.post<Record<string, unknown>>('/vault/rescan');
  return data;
}

export async function createVaultFolder(parentPath: string, name: string): Promise<{ path: string }> {
  const { data } = await api.post<{ path: string }>('/vault/folders', { parentPath, name });
  return data;
}

export async function deleteVaultFolder(path: string): Promise<void> {
  await api.delete('/vault/folders', { params: { path } });
}

export async function readNoteFile(path: string): Promise<NoteFile> {
  const { data } = await api.get<NoteFile>('/notes/file', { params: { path } });
  return data;
}

export async function saveNoteFile(path: string, content: string, baseMtime?: number): Promise<SaveResult> {
  const { data } = await api.put<SaveResult>(`/notes/file`, { content, baseMtime: baseMtime ?? null }, { params: { path } });
  return data;
}

/** Zotero 式阅读分诊：标未读/在读/已读、打星。两个字段可单独更新。 */
export async function updateReadingState(
  id: number,
  payload: { readStatus?: 'unread' | 'reading' | 'done'; rating?: number }
): Promise<Paper> {
  const { data } = await api.patch<Paper>(`/papers/${id}/reading-state`, payload);
  return data;
}

export interface CitationSet {
  paperId: number;
  citeKey: string;
  apa: string;
  ieee: string;
  gbt7714: string;
  bibtex: string;
}

/** 一次拿全部引文格式，省得切换格式就发一次请求。 */
export async function getCitations(paperId: number): Promise<CitationSet> {
  const { data } = await api.get<CitationSet>(`/citations/${paperId}/all`);
  return data;
}

/** 批量导出 .bib 文本；ids 省略则导出全部未删除文献。 */
export async function exportBibtex(ids?: number[]): Promise<string> {
  const { data } = await api.get<string>('/citations/bibtex', {
    params: ids && ids.length > 0 ? { ids: ids.join(',') } : undefined,
    responseType: 'text'
  });
  return data;
}

export interface VaultAttachment {
  path: string;
  name: string;
  size: number;
  /** 可直接插进 Markdown 的 Obsidian 嵌入语法 ![[名字]] */
  embed: string;
}

/**
 * 上传附件到 Vault 的 Attachments/。
 * 编辑器里粘贴或拖拽图片/音视频时调用 —— 此前整个项目除论文 PDF 外没有任何上传入口，
 * 白名单虽然允许写 Attachments/ 下的图片，却没有办法把文件弄进去。
 */
export async function uploadVaultAttachment(file: File): Promise<VaultAttachment> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<VaultAttachment>('/vault/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

/** Vault 内任意文件的原始字节 URL（图片/音视频嵌入、PDF 预览都用它）。 */
export function vaultFileUrl(relPath: string): string {
  return apiUrl(`/vault/file?path=${encodeURIComponent(relPath)}`);
}

export async function createVaultNote(parentPath: string, title: string, content?: string): Promise<CreateNoteResult> {
  const { data } = await api.post<CreateNoteResult>('/notes/create', { parentPath, title, content: content ?? '' });
  return data;
}

export async function renameVaultNote(path: string, newName: string, updateReferences: boolean): Promise<RenameResult> {
  const { data } = await api.post<RenameResult>('/notes/rename', { path, newName, updateReferences });
  return data;
}

export async function moveVaultNote(path: string, targetDir: string): Promise<{ path: string }> {
  const { data } = await api.post<{ path: string }>('/notes/move', { path, targetDir });
  return data;
}

export async function deleteVaultFile(path: string): Promise<void> {
  await api.delete('/notes/file', { params: { path } });
}

export async function searchVault(q: string): Promise<SearchResultRow[]> {
  const { data } = await api.get<SearchResultRow[]>('/notes/search', { params: { q } });
  return data;
}

export async function listPropertyKeys(): Promise<string[]> {
  const { data } = await api.get<string[]>('/notes/properties');
  return data;
}

export async function listTableRows(): Promise<TableRow[]> {
  const { data } = await api.get<TableRow[]>('/notes/table');
  return data;
}

export async function saveNoteProperties(path: string, properties: Record<string, unknown>, baseMtime?: number): Promise<SaveResult> {
  const { data } = await api.put<SaveResult>('/notes/properties', { properties, baseMtime: baseMtime ?? null }, { params: { path } });
  return data;
}

export async function getBacklinksByPath(path: string): Promise<BacklinkRow[]> {
  const { data } = await api.get<BacklinkRow[]>('/links/backlinks', { params: { path } });
  return data;
}

export async function getOutgoingByPath(path: string): Promise<OutgoingLinkRow[]> {
  const { data } = await api.get<OutgoingLinkRow[]>('/links/outgoing', { params: { path } });
  return data;
}

export async function getUnlinkedByPath(path: string): Promise<BacklinkRow[]> {
  const { data } = await api.get<BacklinkRow[]>('/links/unlinked', { params: { path } });
  return data;
}

export async function createLinkFromMention(sourcePath: string, targetTitle: string): Promise<{ linked: boolean }> {
  const { data } = await api.post<{ linked: boolean }>('/links/create', { sourcePath, targetTitle });
  return data;
}

export async function getGlobalGraph(): Promise<GraphData> {
  const { data } = await api.get<GraphData>('/graph/global');
  return data;
}

export async function getLocalGraph(path: string, depth: number): Promise<GraphData> {
  const { data } = await api.get<GraphData>('/graph/local', { params: { path, depth } });
  return data;
}

/**
 * 语义检索现在是段落级的：命中的是 embedding_chunk 里的某一块，
 * 所以结果必须带回 snippet（命中片段）和 page（在第几页）——
 * 研究工具要回答的是「哪一段讲了这个」，只给相似度百分比没有用。
 */
export interface SemanticHit {
  id: number;
  title: string;
  similarity: number;
  chunkIndex: number;
  page: number | null;
  snippet: string;
}

export interface SemanticSearchResult {
  papers: Array<SemanticHit & { authors?: string; year?: number; doi?: string }>;
  notes: Array<SemanticHit & { path?: string }>;
}

export interface EmbedBatchResult {
  ok: number;
  skipped: number;
  failed: number;
  sources: number;
  model: string;
  errors: string[];
}

export async function semanticSearch(query: string, scope: 'all' | 'papers' | 'notes' = 'all', limit = 10): Promise<SemanticSearchResult> {
  const { data } = await api.post<SemanticSearchResult>('/search/semantic', { query, scope, limit });
  return data;
}

export async function embedPapers(): Promise<EmbedBatchResult> {
  const { data } = await api.post<EmbedBatchResult>('/admin/embed-papers');
  return data;
}

export async function embedNotes(): Promise<EmbedBatchResult> {
  const { data } = await api.post<EmbedBatchResult>('/admin/embed-notes');
  return data;
}

export interface HybridSearchResult {
  papers: Array<{
    id: number;
    title: string;
    rrfScore: number;
    similarity: number;
    hasSemantic: boolean;
  }>;
  strategy: string;
  candidateCount: number;
  keywordHits: number;
  semanticHits: number;
}

export async function hybridSearch(params: {
  query: string;
  tag?: string;
  yearFrom?: number;
  yearTo?: number;
  favoriteOnly?: boolean;
  limit?: number;
}): Promise<HybridSearchResult> {
  const { data } = await api.post<HybridSearchResult>('/search/hybrid', params);
  return data;
}

export interface GlobalSearchResult {
  query: string;
  papers: Array<{
    id: number;
    title: string;
    authors: string | null;
    year: number | null;
    type: 'paper';
  }>;
  notes: Array<{
    id?: number;
    title: string;
    path: string;
    snippet?: string | null;
    type: 'note';
  }>;
  annotations: Array<{
    id: number;
    paperId: number;
    paperTitle: string;
    page: number;
    color: string | null;
    snippet: string | null;
    type: 'annotation';
  }>;
  conversations: Array<{
    id: number;
    title: string;
    updatedAt?: string;
    messageCount: number;
    snippet?: string | null;
    type: 'conversation';
  }>;
  totalCount: number;
}

export async function globalSearch(query: string): Promise<GlobalSearchResult> {
  const { data } = await api.post<GlobalSearchResult>('/search/global', { query });
  return data;
}

export interface AiAttachment {
  path: string;
  name: string;
  size: number;
  contentType: string;
}

export async function uploadAiAttachment(file: File): Promise<AiAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post<AiAttachment>('/ai/chat/attachment', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

export async function deleteAiAttachment(path: string): Promise<void> {
  await api.delete('/ai/chat/attachment', { params: { path } });
}
