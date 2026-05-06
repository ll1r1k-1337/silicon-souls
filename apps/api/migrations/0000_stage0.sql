CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  current_spec_session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS spec_sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  status TEXT NOT NULL,
  raw_idea TEXT NOT NULL,
  current_version_id TEXT,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS spec_artifacts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  artifact_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  source JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spec_artifacts_session_type
  ON spec_artifacts (session_id, artifact_type);

CREATE TABLE IF NOT EXISTS spec_versions (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  version TEXT NOT NULL,
  status TEXT NOT NULL,
  markdown_snapshot TEXT NOT NULL,
  json_snapshot JSONB NOT NULL,
  change_summary TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_spec_versions_session_created
  ON spec_versions (session_id, created_at);

CREATE TABLE IF NOT EXISTS review_reports (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  version_id TEXT REFERENCES spec_versions(id),
  can_approve BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS event_store (
  id TEXT PRIMARY KEY,
  aggregate_id TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version INTEGER NOT NULL,
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_event_store_aggregate
  ON event_store (aggregate_id, aggregate_type, created_at);

CREATE TABLE IF NOT EXISTS spec_documents (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES spec_sessions(id),
  current_version_id TEXT,
  markdown TEXT NOT NULL,
  dirty BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS background_jobs (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload JSONB NOT NULL,
  result JSONB,
  error JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  run_after TIMESTAMPTZ NOT NULL,
  locked_at TIMESTAMPTZ,
  locked_by TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_status_run_after
  ON background_jobs (status, run_after);

CREATE TABLE IF NOT EXISTS llm_invocations (
  id TEXT PRIMARY KEY,
  trace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  chain_name TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  status TEXT NOT NULL,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  error_code TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS llm_provider_settings (
  id TEXT PRIMARY KEY,
  provider_type TEXT NOT NULL,
  base_url TEXT NOT NULL,
  model TEXT NOT NULL,
  api_key TEXT,
  api_key_mask TEXT,
  is_configured BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);
