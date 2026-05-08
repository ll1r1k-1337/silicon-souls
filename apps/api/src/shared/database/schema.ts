import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const projects = pgTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').notNull(),
  currentSpecSessionId: text('current_spec_session_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const specSessions = pgTable('spec_sessions', {
  id: text('id').primaryKey(),
  projectId: text('project_id')
    .notNull()
    .references(() => projects.id),
  status: text('status').notNull(),
  rawIdea: text('raw_idea').notNull(),
  currentVersionId: text('current_version_id'),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const conversationTurns = pgTable('conversation_turns', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => specSessions.id),
  role: text('role').notNull(),
  content: text('content').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const specArtifacts = pgTable(
  'spec_artifacts',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => specSessions.id),
    artifactType: text('artifact_type').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    source: jsonb('source').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    sessionTypeIdx: index('idx_spec_artifacts_session_type').on(
      table.sessionId,
      table.artifactType,
    ),
  }),
);

export const specVersions = pgTable(
  'spec_versions',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => specSessions.id),
    version: text('version').notNull(),
    status: text('status').notNull(),
    markdownSnapshot: text('markdown_snapshot').notNull(),
    documentContentSnapshot: jsonb('document_content_snapshot').$type<Record<string, unknown>>(),
    jsonSnapshot: jsonb('json_snapshot').$type<Record<string, unknown>>().notNull(),
    changeSummary: text('change_summary'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    sessionVersionIdx: index('idx_spec_versions_session_created').on(
      table.sessionId,
      table.createdAt,
    ),
  }),
);

export const reviewReports = pgTable('review_reports', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => specSessions.id),
  versionId: text('version_id').references(() => specVersions.id),
  canApprove: boolean('can_approve').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const eventStore = pgTable(
  'event_store',
  {
    id: text('id').primaryKey(),
    aggregateId: text('aggregate_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    eventType: text('event_type').notNull(),
    eventVersion: integer('event_version').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    aggregateIdx: index('idx_event_store_aggregate').on(
      table.aggregateId,
      table.aggregateType,
      table.createdAt,
    ),
  }),
);

export const specDocuments = pgTable('spec_documents', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => specSessions.id),
  currentVersionId: text('current_version_id'),
  contentJson: jsonb('content_json').$type<Record<string, unknown>>(),
  schemaVersion: text('schema_version').notNull().default('tiptap.v1'),
  projectionStatus: text('projection_status').notNull().default('synced'),
  markdown: text('markdown').notNull(),
  dirty: boolean('dirty').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const documentCommentThreads = pgTable(
  'document_comment_threads',
  {
    id: text('id').primaryKey(),
    sessionId: text('session_id')
      .notNull()
      .references(() => specSessions.id),
    documentId: text('document_id').references(() => specDocuments.id),
    versionId: text('version_id').references(() => specVersions.id),
    status: text('status').notNull(),
    anchor: jsonb('anchor').$type<Record<string, unknown>>().notNull().default({}),
    selectedText: text('selected_text'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    sessionStatusIdx: index('idx_document_comment_threads_session_status').on(
      table.sessionId,
      table.status,
    ),
  }),
);

export const documentComments = pgTable(
  'document_comments',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => documentCommentThreads.id),
    author: text('author').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    threadCreatedIdx: index('idx_document_comments_thread_created').on(
      table.threadId,
      table.createdAt,
    ),
  }),
);

export const documentSuggestions = pgTable(
  'document_suggestions',
  {
    id: text('id').primaryKey(),
    threadId: text('thread_id')
      .notNull()
      .references(() => documentCommentThreads.id),
    status: text('status').notNull(),
    replacementMarkdown: text('replacement_markdown'),
    replacementContentJson: jsonb('replacement_content_json').$type<Record<string, unknown>>(),
    rationale: text('rationale'),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  },
  (table) => ({
    threadStatusIdx: index('idx_document_suggestions_thread_status').on(
      table.threadId,
      table.status,
    ),
  }),
);

export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: text('id').primaryKey(),
    type: text('type').notNull(),
    status: text('status').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    result: jsonb('result').$type<Record<string, unknown>>(),
    error: jsonb('error').$type<Record<string, unknown>>(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(2),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (table) => ({
    statusRunAfterIdx: index('idx_background_jobs_status_run_after').on(
      table.status,
      table.runAfter,
    ),
  }),
);

export const llmInvocations = pgTable('llm_invocations', {
  id: text('id').primaryKey(),
  traceId: text('trace_id').notNull(),
  projectId: text('project_id').notNull(),
  sessionId: text('session_id').notNull(),
  chainName: text('chain_name').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  promptVersion: text('prompt_version').notNull(),
  status: text('status').notNull(),
  durationMs: integer('duration_ms'),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  totalTokens: integer('total_tokens'),
  errorCode: text('error_code'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const llmProviderSettings = pgTable('llm_provider_settings', {
  id: text('id').primaryKey(),
  providerType: text('provider_type').notNull(),
  baseUrl: text('base_url').notNull(),
  model: text('model').notNull(),
  apiKey: text('api_key'),
  apiKeyMask: text('api_key_mask'),
  isConfigured: boolean('is_configured').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type SpecSessionRow = typeof specSessions.$inferSelect;
export type ConversationTurnRow = typeof conversationTurns.$inferSelect;
export type SpecArtifactRow = typeof specArtifacts.$inferSelect;
export type SpecVersionRow = typeof specVersions.$inferSelect;
export type SpecDocumentRow = typeof specDocuments.$inferSelect;
export type DocumentCommentThreadRow = typeof documentCommentThreads.$inferSelect;
export type DocumentCommentRow = typeof documentComments.$inferSelect;
export type DocumentSuggestionRow = typeof documentSuggestions.$inferSelect;
export type ReviewReportRow = typeof reviewReports.$inferSelect;
export type BackgroundJobRow = typeof backgroundJobs.$inferSelect;
export type LlmProviderSettingsRow = typeof llmProviderSettings.$inferSelect;
