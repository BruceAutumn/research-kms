import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const papers = sqliteTable("papers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  authors: text("authors"),
  year: integer("year"),
  doi: text("doi"),
  abstractText: text("abstract_text"),
  extractedText: text("extracted_text"),
  filename: text("filename"),
  objectKey: text("object_key"),
  contentType: text("content_type"),
  sizeBytes: integer("size_bytes").notNull().default(0),
  collectionName: text("collection_name").notNull().default("收件箱"),
  tags: text("tags").notNull().default("[]"),
  favorite: integer("favorite", { mode: "boolean" }).notNull().default(false),
  readingProgress: integer("reading_progress").notNull().default(0),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull().default(""),
}, (table) => [
  index("idx_papers_user_created").on(table.userId, table.createdAt),
  index("idx_papers_user_collection").on(table.userId, table.collectionName),
]);

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  folder: text("folder").notNull().default("Inbox"),
  properties: text("properties").notNull().default("{}"),
  pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
  stableId: text("stable_id").notNull().default(""),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_notes_user_updated").on(table.userId, table.updatedAt)]);

export const annotations = sqliteTable("annotations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  paperId: integer("paper_id").notNull(),
  page: integer("page").notNull().default(1),
  type: text("type").notNull().default("highlight"),
  color: text("color").notNull().default("yellow"),
  text: text("text").notNull().default(""),
  comment: text("comment").notNull().default(""),
  rectsJson: text("rects_json").notNull().default("[]"),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_annotations_user_paper").on(table.userId, table.paperId, table.page)]);

export const llmSettings = sqliteTable("llm_settings", {
  userId: text("user_id").primaryKey(),
  providerName: text("provider_name").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  protocol: text("protocol").notNull().default("openai"),
  apiKeyCipher: text("api_key_cipher").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiMessages = sqliteTable("ai_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  conversationId: text("conversation_id").notNull().default(""),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ai_messages_user_created").on(table.userId, table.createdAt)]);

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_conversations_user_updated").on(table.userId, table.updatedAt)]);

export const agentRuns = sqliteTable("agent_runs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  conversationId: text("conversation_id").notNull(),
  status: text("status").notNull(),
  prompt: text("prompt").notNull(),
  paperId: integer("paper_id"),
  noteId: integer("note_id"),
  stepCount: integer("step_count").notNull().default(0),
  answer: text("answer"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_agent_runs_user_updated").on(table.userId, table.updatedAt)]);

export const agentSteps = sqliteTable("agent_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: text("run_id").notNull(),
  userId: text("user_id").notNull(),
  sequence: integer("sequence").notNull(),
  toolName: text("tool_name").notNull(),
  inputJson: text("input_json").notNull().default("{}"),
  outputJson: text("output_json"),
  status: text("status").notNull(),
  permission: text("permission").notNull().default("read"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("idx_agent_steps_run_sequence").on(table.runId, table.sequence),
  index("idx_agent_steps_user_run").on(table.userId, table.runId),
]);

export const noteLinks = sqliteTable("note_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  sourceNoteId: integer("source_note_id").notNull(),
  targetTitle: text("target_title").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_note_links_user_target").on(table.userId, table.targetTitle)]);

export const plugins = sqliteTable("plugins", {
  id: text("id").notNull(),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  version: text("version").notNull(),
  kind: text("kind").notNull(),
  manifestJson: text("manifest_json").notNull(),
  permissionsJson: text("permissions_json").notNull().default("[]"),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  installedAt: text("installed_at").notNull(),
}, (table) => [uniqueIndex("idx_plugins_user_id").on(table.userId, table.id)]);

export const rateLimits = sqliteTable("rate_limits", {
  userId: text("user_id").notNull(),
  bucket: text("bucket").notNull(),
  windowStart: integer("window_start").notNull(),
  count: integer("count").notNull().default(0),
}, (table) => [uniqueIndex("idx_rate_limits_user_bucket").on(table.userId, table.bucket)]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_audit_created").on(table.createdAt)]);
