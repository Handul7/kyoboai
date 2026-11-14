import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Only migration generation imports Drizzle; the deployed Worker uses D1 directly.
export const sourcePermissions = sqliteTable("source_permissions", {
  id: text("id").primaryKey().notNull(),
  enabled: integer("enabled").notNull().default(0),
  bodyAllowed: integer("body_allowed").notNull().default(0),
  aiAllowed: integer("ai_allowed").notNull().default(0),
  permissionNote: text("permission_note").notNull().default(""),
  updatedAt: text("updated_at").notNull(),
});

export const members = sqliteTable("members", {
  userId: text("user_id").primaryKey().notNull(),
  departmentId: text("department_id").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const articles = sqliteTable("articles", {
  id: text("id").primaryKey().notNull(),
  sourceId: text("source_id").notNull(),
  url: text("url").notNull(),
  bodyHash: text("body_hash").notNull(),
  title: text("title").notNull(),
  publishedAt: text("published_at").notNull(),
  body: text("body").notNull(),
  receivedAt: text("received_at").notNull(),
  permissionNote: text("permission_note").notNull(),
}, (table) => [
  uniqueIndex("articles_url_unique").on(table.url),
  index("articles_published_at_idx").on(table.publishedAt),
  index("articles_source_id_idx").on(table.sourceId),
]);

export const judgments = sqliteTable("judgments", {
  articleId: text("article_id").primaryKey().notNull(),
  bodyHash: text("body_hash").notNull(),
  pipelineVersion: text("pipeline_version").notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const runs = sqliteTable("runs", {
  id: text("id").primaryKey().notNull(),
  runKey: text("run_key").notNull(),
  windowId: text("window_id").notNull(),
  departmentId: text("department_id").notNull(),
  status: text("status").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
  error: text("error"),
  counts: text("counts").notNull().default("{}"),
  leaseUntil: text("lease_until").notNull(),
  ownerToken: text("owner_token").notNull(),
}, (table) => [uniqueIndex("runs_run_key_unique").on(table.runKey)]);

export const reports = sqliteTable("reports", {
  id: text("id").primaryKey().notNull(),
  runKey: text("run_key").notNull(),
  departmentId: text("department_id").notNull(),
  windowId: text("window_id").notNull(),
  windowJson: text("window_json").notNull(),
  title: text("title").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull(),
  publishedAt: text("published_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  uniqueIndex("reports_run_key_unique").on(table.runKey),
  index("reports_department_status_idx").on(table.departmentId, table.status),
]);

export const auditLog = sqliteTable("audit_log", {
  id: text("id").primaryKey().notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  target: text("target").notNull(),
  createdAt: text("created_at").notNull(),
});
