# Stage 0 Implementation Notes

## Source of Truth

Conversation turns are stored for audit and traceability, but structured artifacts, spec versions, review reports, event store records and PostgreSQL snapshots are the source of truth.

## Background Jobs

The API creates rows in `background_jobs` and returns `jobId` immediately. The worker claims queued jobs and writes validated results back to PostgreSQL.

Supported job types:

- `extract_artifacts`
- `generate_clarifying_questions`
- `generate_draft`
- `run_review`
- `apply_change_request`
- `export_bundle`

## Approval

Approval is blocked when domain validation finds missing required sections, blocking open questions, high-impact unconfirmed assumptions, requirement conflicts or missing acceptance criteria for must-have requirements.

Successful approval creates immutable version `1.0.0`, marks the session and project as `ready_for_decomposition`, and keeps export bundle validation in the API path.

## LLM Provider Settings

Stage 0 supports runtime configuration for OpenAI-compatible providers. The Settings UI stores `BASE_URL`, `API_KEY`, and `model` in PostgreSQL. API responses only expose a masked key. Existing jobs use the latest settings because the chain runner resolves the provider at execution time.

If no configured row exists, the API falls back to `.env` values. If neither DB nor env settings contain an API key, the deterministic mock provider is used.

## Out of Scope

Stage 0 intentionally excludes auth, multi-user collaboration, GitHub integration, production-code generation, CI/CD and Redis/BullMQ.
