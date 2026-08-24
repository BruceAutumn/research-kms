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

export const api = axios.create({
  baseURL: '/api',
  timeout: 60_000
});

/**
 * from 409 Extract conflict detail from response. 
 *
 * Must have this step: axios Throws AxiosError, Response body in error.response.data in. 
 * directly `err as SaveConflictError` got conflict always undefined --
 * EditorPane Conflict dialog never popped for this reason. 
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
  /** Both coordinate fields must write: position is legacy Frontend reads, rectsJson isBackend ToolRead .  */
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

// ---------------------------------------------------------------- AI Extraction(persist + Traceable)

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
  return `/api/papers/${id}/file`;
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
 * Only change body save. 
 *
 * Originally used PUT /notes/{id}, But backend NoteRequest.title has @NotBlank, 
 * only pass content always 400 -- Notes tab  AutosaveneverSuccesspassOnetime. 
 * now via PATCH /notes/{id}/content, andwith optimistic lock version: 
 * version notMatchwill get 409 + serverContent + serverVersion, byCallcaller givesUserThreeSelectOne. 
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
  const source = new EventSource(`/api/runs/${id}/stream`);
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

/** Zotero styleReadingtriage: Mark Unread/Reading/Read, Star. twoFieldCanseparateUpdate.  */
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

/** OnefetchAllCitationFormat, saveCutChangeFormatthen sendOnetimeRequest.  */
export async function getCitations(paperId: number): Promise<CitationSet> {
  const { data } = await api.get<CitationSet>(`/citations/${paperId}/all`);
  return data;
}

/** Batch Export .bib text; ids omit then exportAllnotDeletePaper.  */
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
  /** Can directly insert Markdown   Obsidian embedSyntax ![[Name]] */
  embed: string;
}

/**
 * Upload attachment to Vault   Attachments/. 
 * Paste/drop image in editor/Called for audio/video -- before whole project exceptPaper PDF nothing outsideUploadentry, 
 * Whitelist allows write Attachments/ underImage, but no way toFileget inGo. 
 */
export async function uploadVaultAttachment(file: File): Promise<VaultAttachment> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await api.post<VaultAttachment>('/vault/attachments', form, {
    headers: { 'Content-Type': 'multipart/form-data' }
  });
  return data;
}

/** Vault Raw bytes of any file inside URL(Image/Audio/video embed, PDF Preview uses it).  */
export function vaultFileUrl(relPath: string): string {
  return `/api/vault/file?path=${encodeURIComponent(relPath)}`;
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
 * Semantic search is now paragraph-level: Hit is embedding_chunk some block in, 
 * so resultMustbring back snippet(Hit Segment)and page(at whichPage)--
 * researchToolwantAnsweris"Which paragraph covers this", Similarity percentage alone is useless. 
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
    id: number;
    title: string;
    path: string | null;
    paperId: number | null;
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
