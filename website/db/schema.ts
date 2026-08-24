import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_papers_user_created").on(table.userId, table.createdAt)]);

export const notes = sqliteTable("notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [index("idx_notes_user_updated").on(table.userId, table.updatedAt)]);

export const llmSettings = sqliteTable("llm_settings", {
  userId: text("user_id").primaryKey(),
  providerName: text("provider_name").notNull(),
  baseUrl: text("base_url").notNull(),
  model: text("model").notNull(),
  apiKeyCipher: text("api_key_cipher").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiMessages = sqliteTable("ai_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id").notNull(),
  mode: text("mode").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_ai_messages_user_created").on(table.userId, table.createdAt)]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"),
  createdAt: text("created_at").notNull(),
}, (table) => [index("idx_audit_created").on(table.createdAt)]);
