export type AiStatus =
  | 'NOT_PROCESSED'
  | 'QUEUED'
  | 'READING'
  | 'EXTRACTING'
  | 'REVIEW_REQUIRED'
  | 'COMPLETED'
  | 'FAILED';

export interface Paper {
  id: number;
  userId: number;
  title: string;
  authors?: string;
  journal?: string;
  year?: number;
  doi?: string;
  volume?: string;
  pages?: string;
  url?: string;
  abstract?: string;
  tags: string[];
  pdfPath?: string;
  aiStatus: AiStatus;
  favorite: boolean;
  trashed: boolean;
  createdAt?: string;
  dateModified?: string;
  lastOpenedAt?: string;
  /** Zotero styleReadingtriage: unread / reading / done */
  readStatus?: 'unread' | 'reading' | 'done';
  /** 0-5 star, 0 = Unrated */
  rating?: number;
  /** Process Status: PROCESSING / READY / ERROR / DUPLICATE */
  processStatus?: 'PROCESSING' | 'READY' | 'ERROR' | 'DUPLICATE';
}

export interface MetadataField {
  key: string;
  value: string;
}

export interface MetadataSaveResult {
  fields: MetadataField[];
  saved: number;
  droppedEmptyKeys: number;
  overwrittenKeys: string[];
}

export interface ExtractResponse {
  fields: MetadataField[];
}

export interface Collection {
  id: number;
  parentId: number | null;
  name: string;
  sortOrder: number;
  paperCount: number;
  createdAt?: string;
}

export interface Annotation {
  id: number;
  userId: number;
  paperId: number;
  page: number;
  /** legacy Coordinate Field: Phase 4 Old frontend only wrote here.  */
  position?: string;
  /** V9 starting coordinate field, Backend Tool(ListAnnotationsTool / Note Export)Reads it.  */
  rectsJson?: string;
  selectedText?: string;
  color: string;
  comment?: string;
  createdAt?: string;
}

export type ExtractionStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EDITED';

export interface AiExtractionRow {
  id: number;
  paperId: number;
  field: string;
  fieldGroup: string;
  originalValue?: string | null;
  extractedValue?: string | null;
  confidence?: number | null;
  status: ExtractionStatus;
  userValue?: string | null;
  modelUsed?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ImportBibtexError {
  index: number;
  message: string;
}

export interface ImportBibtexResult {
  created: Paper[];
  errors: ImportBibtexError[];
}

export interface Note {
  id: number;
  userId: number;
  title: string;
  content: string;
  properties: Record<string, unknown>;
  paperId?: number;
  createdAt?: string;
  updatedAt?: string;
  /** optimistic lock version: Pass back as-is on save, notMatchwill get 409.  */
  version?: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
}

export interface AiConversation {
  id: number;
  title: string;
  updatedAt?: string;
  messageCount: number;
}

export interface AiConversationDetail extends AiConversation {
  messages: ChatMessage[];
}

export interface Settings {
  provider?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
}

export interface ModelConfig {
  id: number;
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  hasApiKey: boolean;
  modelName: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  embeddingModel?: string;
  isDefault: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ModelConfigRequest {
  name?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
  modelName?: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  embeddingModel?: string;
  isDefault?: boolean;
}

export interface ModelTestResult {
  success: boolean;
  type: string;
  message: string;
  model?: string;
  modelConfigId?: number;
}

export interface LlmProvider {
  id: number;
  name: string;
  kind: string;
  baseUrl: string;
  keyMasked: string;
  hasApiKey: boolean;
  extraHeaders: Record<string, unknown>;
  notes?: string | null;
  enabled: boolean;
  modelCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface LlmProviderRequest {
  name?: string;
  kind?: string;
  baseUrl?: string;
  apiKey?: string;
  extraHeaders?: Record<string, unknown>;
  notes?: string;
  enabled?: boolean;
}

export interface LlmModel {
  id: number;
  providerId: number;
  providerName: string;
  providerKind: string;
  modelId: string;
  displayName: string;
  contextWindow?: number;
  supportsTools: boolean;
  supportsStream: boolean;
  isDefault: boolean;
  enabled: boolean;
  /** 'chat' | 'embedding' -- Decide if this model can be EmbeddingService Selected.  */
  capability: 'chat' | 'embedding';
  createdAt?: string;
}

export interface LlmModelRequest {
  providerId?: number;
  modelId?: string;
  displayName?: string;
  contextWindow?: number;
  supportsTools?: boolean;
  supportsStream?: boolean;
  isDefault?: boolean;
  enabled?: boolean;
  capability?: 'chat' | 'embedding';
}

export interface LlmProviderTestResult {
  ok: boolean;
  latencyMs?: number;
  upstreamStatus?: number;
  modelCount?: number;
  error?: string;
}

export interface SystemAbout {
  version: string;
  backendHealth: string;
  flywayVersion: string;
  mockLlm: boolean;
}

export interface ToolInfo {
  name: string;
  displayName: string;
  category: string;
  description: string;
  parameterSchema: Record<string, unknown>;
  writeOperation: boolean;
  permissionKey: string;
}

export interface Agent {
  id: number;
  userId: number;
  name: string;
  model?: string;
  prompt?: string;
  tools: string[];
  createdAt?: string;
  modelConfigId?: number;
  llmModelId?: number;
  knowledgeScope?: Record<string, unknown>;
  memoryConfig?: Record<string, unknown>;
  outputConfig?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  workflowId?: number | null;
  advanced?: Record<string, unknown>;
  pinned?: boolean;
  icon?: string;
  description?: string;
}

export interface AgentRequest {
  name: string;
  model?: string;
  prompt?: string;
  tools: string[];
  modelConfigId?: number;
  llmModelId?: number;
  knowledgeScope?: Record<string, unknown>;
  memoryConfig?: Record<string, unknown>;
  outputConfig?: Record<string, unknown>;
  permissions?: Record<string, unknown>;
  workflowId?: number | null;
  advanced?: Record<string, unknown>;
  pinned?: boolean;
  icon?: string;
  description?: string;
}

export interface AgentPromptVersion {
  id: number;
  agentId: number;
  version: number;
  prompt: string;
  createdAt?: string;
}

export interface WorkflowStep {
  id?: number;
  workflowId?: number;
  stepOrder: number;
  toolName: string;
  prompt?: string;
  inputMapping?: Record<string, unknown>;
  outputKey?: string;
  condition?: string;
  retryPolicy?: Record<string, unknown>;
  enabled: boolean;
}

export interface Workflow {
  id: number;
  name: string;
  description?: string;
  createdAt?: string;
  updatedAt?: string;
  steps: WorkflowStep[];
}

export interface AgentRunStep {
  id: number;
  runId: number;
  stepOrder: number;
  toolName?: string;
  eventType: string;
  status: string;
  message?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  durationMs?: number;
  tokenUsage?: Record<string, unknown>;
  createdAt?: string;
}

export interface AgentRun {
  id: number;
  agentId?: number;
  status: string;
  input: string;
  contextRefs: Array<Record<string, unknown>>;
  modelConfigId?: number;
  llmModelId?: number;
  startedAt?: string;
  finishedAt?: string;
  tokenUsage?: Record<string, unknown>;
  error?: string;
  steps: AgentRunStep[];
}

export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  builtin: boolean;
}

export interface AgentRunRequest {
  instruction: string;
  agentId?: number;
  modelConfigId?: number;
  llmModelId?: number;
  modelId?: number;
  contextRefs?: Array<Record<string, unknown>>;
}

export interface AgentStepEvent {
  type: 'thinking' | 'step' | 'done' | 'error';
  message: string;
  tool?: string;
  detail?: string;
  ts?: number;
}

export interface PdfSelection {
  text: string;
  page: number;
  /** PDF Page coord normalized rect list(viewToPage After convert) */
  rects: Array<{ x: number; y: number; w: number; h: number }>;
  /** Selected mouse position(Viewport Coord), For floating menu position */
  x?: number;
  y?: number;
}

// ================================================================
// Phase 4: Knowledge Vault type
// ================================================================

export interface VaultInfo {
  root: string;
  baseDirs: string[];
  watcher: { mode: 'polling'; intervalMs: number };
  indexedNotes: number;
}

export type VaultNodeType = 'folder' | 'md' | 'canvas' | 'pdf' | 'image' | 'other';

export interface VaultTreeNode {
  name: string;
  path: string; // Vault Inner Relative Path(root as '')
  type: VaultNodeType;
  mtime?: number;
  ctime?: number;
  children?: VaultTreeNode[];
}

export interface NoteFile {
  path: string;
  title: string;
  content: string;      // Raw Text(Editor Unique Input)
  body: string;         // Remove frontmatter body
  properties: Record<string, unknown>;
  frontmatterValid: boolean;
  mtime: number;
}

export interface SaveResult {
  path: string;
  mtime: number;
  saved: boolean;
}

export interface SaveConflictError {
  error: string;
  conflict?: boolean;
  serverContent?: string;
  /** Vault File save goes through mtime Compare */
  serverMtime?: number;
  /** Note body save goes through version Compare */
  serverVersion?: number;
  yourVersion?: number;
}

export interface CreateNoteResult {
  path: string;
  title: string;
  mtime: number;
}

export interface RenameResult {
  path: string;
  title: string;
  updatedReferences: string[];
  referencesUpdated: number;
}

export interface SearchResultRow {
  path: string;
  title: string;
  mtime: number;
  snippet: string;
}

export interface BacklinkRow {
  path: string;
  title: string;
  snippet: string;
}

export interface OutgoingLinkRow {
  targetTitle: string;
  targetPath: string | null;
  targetRaw: string;
  alias: string | null;
  resolved: boolean;
}

export interface TableRow {
  path: string;
  title: string;
  folder: string;
  mtime: number;
  properties: Record<string, unknown>;
  [key: string]: unknown; // Property key flatten
}

export interface GraphNode {
  id: string;
  label: string;
  folder?: string;
  inDegree?: number;
  depth?: number;
  resolved: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
  resolved: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { nodes: number; edges: number; depth?: number };
}

export interface VaultTab {
  path: string;
  title: string;
  pinned?: boolean;
}

export interface PropertyRow {
  key: string;
  value: unknown;
  valueType: 'text' | 'number' | 'date' | 'list' | 'checkbox' | 'link';
}

export interface AiAttachment {
  path: string;
  name: string;
  size: number;
  contentType: string;
}
