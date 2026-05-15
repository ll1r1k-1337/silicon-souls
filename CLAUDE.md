# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Silicon Souls (Stage 0 PoC) — a chat workspace where the user talks to AI "agents" mentioned with `@handle`. An always-present `@hr` agent can be asked to recruit, generating 3 candidate agents via LangChain structured output; each candidate can then be "hired" and becomes addressable in subsequent chats. See `docs/Step 0.md` for the original technical contract.

The repo is a two-package monorepo with a separate Postgres container:

- `server/` — NestJS 11 (ESM), drizzle-orm, postgres-js, LangChain (`@langchain/openai`), zod
- `web/` — Vue 3 (Composition API), Vite, Tailwind v4, Headless UI
- `docker-compose.yml` — orchestrates `postgres` + `server` + `web`

## Running

The expected dev workflow is `docker compose up` from the repo root. The `server` service auto-runs `npm install && npm run build && npm run seed && npm run start:dev`, and the `web` service runs Vite on `--host`. Postgres is exposed on `5432`, the API on `3000`, the web app on `5173`.

The Vite dev server proxies `/api/*` to `API_TARGET` (defaults to `http://localhost:3000`; set to `http://server:3000` inside Compose). CORS in `server/src/main.ts` is hardcoded to `http://localhost:5173` and `:5174`.

### Per-package commands

Run these from inside `server/` or `web/` respectively (not the repo root — there is no root `package.json`).

**server/** (NestJS):
- `npm run start:dev` — watch-mode Nest
- `npm run build` — compile to `dist/`
- `npm run seed` — runs `dist/src/database/seed.js` (build first); idempotently inserts the `@hr` agent
- `npm run lint` — ESLint with `--fix`
- `npm test` — Jest unit tests (regex `.*\.spec\.ts$` under `src/`)
- `npm run test:e2e` — Jest with `test/jest-e2e.json`
- Single test: `npx jest path/to/file.spec.ts` or `npx jest -t "test name"`

**web/** (Vue):
- `npm run dev` — Vite dev server
- `npm run build` — runs `type-check` (vue-tsc) and `build-only` in parallel via `npm-run-all2`
- `npm run lint` — runs `lint:oxlint` then `lint:eslint` (both with `--fix`); oxlint runs first as a fast pre-pass
- `npm run type-check` — `vue-tsc --build` only

### Database

There is no Drizzle migrations folder. The schema in `server/src/database/schema.ts` is the source of truth; use `npx drizzle-kit push` (against `drizzle.config.ts`) to sync it to Postgres during development. `DATABASE_URL` is required (set by Compose; for local non-Docker runs, put it in `server/.env`).

## Architecture

### Backend module layout

NestJS modules in `server/src/`:

- `DatabaseModule` (`@Global`) — exposes the `DRIZZLE` injection token (a `Symbol`) backed by a `drizzle(postgres(DATABASE_URL))` instance. All DB-touching services inject it via `@Inject(DRIZZLE) private readonly db: DrizzleDB`.
- `SettingsModule` — CRUD for the single `llm` row in `system_settings` (baseURL/apiKey/modelName). `GET /api/settings` returns the apiKey **masked** (`abcdef...wxyz`); `PUT /api/settings` stores raw. `POST /api/settings/check` invokes the model with `maxTokens: 5` to verify reachability.
- `AgentsModule` — `findByHandle` returns `null` if the agent's status is not `HIRED` (this is the gate that prevents the chat router from invoking candidates that haven't been hired yet). `hireCandidate` flips status to `HIRED`. `createCandidates` bulk-inserts with status `CANDIDATE`.
- `ChatModule` — message routing + LLM streaming. See below.

### Chat routing (`ChatService.handleChat`)

This is the heart of the app. Order matters:

1. Load LLM settings; if absent, stream a "configure settings first" message and exit.
2. Take the last message; require `role === 'user'`.
3. Regex `/@([a-zA-Z0-9_]+)/` for a mention. No mention → reply prompting for `@handle`.
4. `findByHandle` (which already filters to `status='HIRED'`). Miss → "Agent not found".
5. If handle is `hr` **and** `isHiringIntent(content)` (keyword match: `hire`, `find`, `recruit`, `looking for`, `developer`, etc.) → `handleHiringRequest` → `CandidateGeneratorService.generate`.
6. Otherwise → `streamAgentResponse`: builds a system message from `agent.personality` and streams `ChatOpenAI.stream()`.

The HR hiring keyword list is duplicated in `web/src/components/ChatView.vue` (`isHiringIntent`) so the UI can show a "generating candidates" placeholder before the data part arrives. Keep them in sync.

### Wire protocol — Vercel AI SDK v1 data stream (hand-rolled)

The server doesn't use `ai`'s helpers; it writes the line-prefixed protocol directly to the Express `Response`:

- Headers: `Content-Type: text/event-stream`, `x-vercel-ai-data-stream: v1`
- `0:<json-string>\n` — text chunk
- `2:<json-array>\n` — data parts; this project's only data part is `{ type: 'CANDIDATES_LIST', payload: [...] }`
- `d:<json>\n` — finish (always written before `res.end()`)

The Vue client (`ChatView.vue`) parses this format manually — `getReader()` + `TextDecoder` + line-buffer + colon-split. It does **not** use `@ai-sdk/vue`'s `useChat` despite being listed in dependencies. If you change the wire format on either side, update both.

### Candidate generation

`CandidateGeneratorService` uses `llm.withStructuredOutput(candidateSchema)` (zod), where the schema requires **exactly 3** candidates (`.length(3)`). Generated candidates are inserted with `status: 'CANDIDATE'` and returned with their new DB UUIDs so the frontend `CandidateCard` knows which id to POST to `/api/agents/hire`. The reply message is then streamed word-by-word with a 30ms delay (cosmetic — the structured call is non-streaming).

### Frontend

Composition-API only. Composables in `web/src/composables/` define module-level `ref`s **outside** the exported function, so they act as singletons (e.g. `useAgents` caches the list across components, `useSettings` triggers `fetchSettings()` on first import). Be careful adding state — putting it inside the function makes it per-caller.

Path alias `@` → `./src` (configured in both `vite.config.ts` and `tsconfig.app.json`).

## Conventions

### ESM imports in the server

`server/tsconfig.json` uses `"module": "nodenext"`. **All relative imports must include the `.js` extension** even though the source is `.ts` (e.g. `import { AppModule } from './app.module.js'`). Forgetting this breaks the build silently for new files.

### Drizzle schema is the contract

The exact column names and enum values in `server/src/database/schema.ts` (`status: ['CANDIDATE', 'HIRED']`, `sender_type: ['USER', 'AGENT']`, `metadata.expected_salary` / `metadata.hr_comment` — note snake_case in JSONB) are referenced by string in `agents.service.ts` and `candidate-generator.service.ts`. Schema changes need matching updates in those services.

### LLM credentials live in the DB, not env

Don't read `OPENAI_API_KEY` from `process.env`. The user configures baseURL/apiKey/modelName through the Settings UI; services fetch them via `SettingsService.getSettings()` and pass them into `ChatOpenAI`. The only env var the server depends on is `DATABASE_URL`.

### Linting

- Server: ESLint w/ `typescript-eslint` recommended-type-checked + Prettier. `@typescript-eslint/no-explicit-any` is **off**; `no-floating-promises` and `no-unsafe-argument` are **warn**.
- Web: oxlint (correctness category, error) runs first, then ESLint with Vue + TypeScript configs. Always run `npm run lint` (the composite), not the sub-tasks alone.
