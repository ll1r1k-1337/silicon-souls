import {
  pgTable,
  varchar,
  uuid,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

/* ── system_settings ──────────────────────────────────── */
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 50 }).primaryKey(),
  value: jsonb('value').$type<{
    baseURL?: string;
    apiKey: string;
    modelName: string;
  }>(),
});

/* ── agents ────────────────────────────────────────────── */
export const agents = pgTable('agents', {
  id: uuid('id').defaultRandom().primaryKey(),
  handle: varchar('handle', { length: 50 }).unique().notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  role: varchar('role', { length: 100 }).notNull(),
  personality: text('personality').notNull(),
  status: varchar('status', { enum: ['CANDIDATE', 'HIRED'] }).default(
    'CANDIDATE',
  ),
  metadata: jsonb('metadata').$type<{
    skills?: string[];
    expected_salary?: string;
    hr_comment?: string;
  }>(),
  createdAt: timestamp('created_at').defaultNow(),
});

/* ── messages ──────────────────────────────────────────── */
export const messages = pgTable('messages', {
  id: uuid('id').defaultRandom().primaryKey(),
  senderType: varchar('sender_type', {
    enum: ['USER', 'AGENT'],
  }).notNull(),
  senderId: uuid('sender_id').references(() => agents.id),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});
