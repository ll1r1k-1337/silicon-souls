import {
  boolean,
  customType,
  pgTable,
  varchar,
  uuid,
  text,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
  toDriver(val: Buffer) {
    return val;
  },
  fromDriver(val: Buffer) {
    return val;
  },
});

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

export const documents = pgTable('documents', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 })
    .notNull()
    .default('New Specification'),
  contentMarkdown: text('content_markdown').default(''),
  yjsState: bytea('yjs_state'),
  isApproved: boolean('is_approved').default(false),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});
