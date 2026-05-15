# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Silicon Souls (Stage 0 PoC) — a local-first chat workspace where the user talks to AI "agents" mentioned with `@handle`. An always-present `@hr` agent can be asked to recruit; it generates 3 candidate agents and presents them to the user via a multi-turn tool call. Each candidate can then be "hired" and becomes addressable in subsequent chats.

The app runs as a single Node process. State persists locally under `~/.silicon-souls/`. No database container, no Docker. The server also serves the built Vue assets on the same port.

Two-package layout:

- `server/` — NestJS 11 (ESM), **RxDB** (in-memory storage + JSON-file snapshot), LangChain (`@langchain/openai`), `@modelcontextprotocol/sdk`, zod
- `web/` — Vue 3 (Composition API), Vite, Tailwind v4, Headless UI
- Root `package.json` orchestrates both with `npm start` / `npm run setup`

## Running

```bash
git clone <repo> && cd silicon-souls
npm run setup        # installs both server and web packages
npm start            # builds web + server, starts on http://localhost:3000
```

For development with HMR, two terminals:

```bash
# terminal 1
npm run dev:server   # Nest --watch on :3000
# terminal 2
npm run dev:web      # Vite on :5173, proxies /api → :3000
```

Data lives at `~/.silicon-souls/db/dump.json` (override with `SILICON_SOULS_HOME`). Delete the directory for a fresh start; `@hr` is re-seeded on next boot.

### Per-package commands

Run these from inside `server/` or `web/` (the root `package.json` shells out to them).

**server/** (NestJS):
- `npm run start:dev` — watch-mode Nest
- `npm run build` — compile to `dist/`
- `npm run lint` — ESLint with `--fix`
- `npm test` — Jest unit tests
- `npm run test:e2e` — Jest with `test/jest-e2e.json`

**web/** (Vue):
- `npm run dev` — Vite dev server
- `npm run build` — vue-tsc + Vite build, outputs to `web/dist/`
- `npm run lint` — oxlint then ESLint
- `npm run type-check` — `vue-tsc --build` only

### Database (RxDB)

`server/src/database/rxdb.providers.ts` creates an `RxDatabase` with `getRxStorageMemory()` and snapshots the entire JSON dump to `~/.silicon-souls/db/dump.json` (debounced 300 ms after any collection change, plus on `SIGINT` / `SIGTERM`). Pure JS, no native deps.

Schemas live in `server/src/database/schemas/`. Each `RxJsonSchema` has `version: 0`; bump the version and add a `migrationStrategies` entry on the collection when changing fields. Collections defined today: `agents`, `systemSettings`.

The HR agent is seeded idempotently from `DatabaseModule.onModuleInit()` if missing.

## Architecture

### Backend module layout

NestJS modules in `server/src/`:

- `DatabaseModule` (`@Global`) — exposes the `RXDB_DATABASE` injection token; runs the HR seeder in `onModuleInit`. All DB-touching services inject `@Inject(RXDB_DATABASE) db: SilSolDatabase`.
- `LlmModule` — provider abstraction, `ChatSessionStore`, internal MCP HTTP controller, tool registry (currently `present_candidates`).
- `SettingsModule` — CRUD for the single `llm` row in `systemSettings`. `GET /api/settings` returns the apiKey masked (`abcdef...wxyz`). `POST /api/settings/check` instantiates the configured provider and calls `provider.checkConnection()`.
- `AgentsModule` — `findByHandle` returns `null` if the agent's status is not `HIRED` (this is the gate that prevents the chat router from invoking candidates that haven't been hired yet).
- `ChatModule` — message routing + LLM streaming + the multi-turn HR tool flow.

### LLM provider abstraction (`server/src/llm/`)

Single interface, four implementations:

- `OpenAiHttpProvider` — wraps `ChatOpenAI` from `@langchain/openai`. Tool calling via `llm.bindTools([...])` with an in-process loop that intercepts `tool_call_chunks`, dispatches to the handler, feeds the result back as a `tool` message, and continues streaming.
- `ClaudeCliProvider` — spawns `claude -p <prompt> --output-format stream-json --mcp-config <tmp> --allowed-tools "mcp__siliconsouls__present_candidates" --permission-mode bypassPermissions --model … --append-system-prompt …`. Env: passes `ANTHROPIC_API_KEY` from settings if present; otherwise relies on the user's host `~/.claude` login.
- `CodexCliProvider` — spawns `codex exec --json --skip-git-repo-check --sandbox danger-full-access --config 'approval_policy="never"' --config 'model="…"' --config 'mcp_servers.siliconsouls.…' <prompt>`. Env: passes `OPENAI_API_KEY` if present.
- `GeminiCliProvider` — spawns `gemini -p <prompt> --model …`. **Streaming text only — does not advertise tools.** HR hiring routes through a prompted-JSON fallback (`CandidateGeneratorService`) for this provider.

Factory: `createProvider(settings)` in `server/src/llm/llm-provider.factory.ts`.

### Internal MCP server

CLI providers expose tools to their model via a private MCP server. The entrypoint is `server/src/llm/mcp/mcp-stdio-entrypoint.ts` (compiled to `dist/`). The CLI spawns it; it speaks MCP-over-stdio outward to the CLI and forwards tool calls inward via `POST http://127.0.0.1:<port>/api/internal/mcp/:sessionId/tool` (auth via per-session `x-mcp-token` header).

The internal HTTP endpoint binds the same Express server (no separate port). The token + session id are passed to the entrypoint via env vars (`SILSOL_SESSION_ID`, `SILSOL_TOKEN`, `SILSOL_API_BASE`).

### Chat routing (`ChatService.handleChat`)

1. Create a `ChatSession` (sessionId + token + `res`).
2. Load LLM settings; if absent, stream a "configure settings first" message and exit.
3. Take the last message; require `role === 'user'`.
4. Regex `/@([a-zA-Z0-9_]+)/` for a mention.
5. `AgentsService.findByHandle` (which filters to `status='HIRED'`). Miss → "Agent not found".
6. If handle is `hr` **and** `isHiringIntent(content)`:
   - Gemini → `handleHiringRequestFallback` (prompted-JSON via `CandidateGeneratorService`).
   - Otherwise → `handleHiringRequest`: register `present_candidates` tool, call `provider.stream({tools, sessionId})`. The tool handler persists candidates, streams them to the UI via the existing `CANDIDATES_LIST` data part (extended with `sessionId`/`toolCallId`), blocks on a session-store Promise. When the user clicks a card, the frontend posts to `/api/chat/tool-result`, which resolves the Promise and the LLM resumes streaming its acknowledgement on the same response.
7. Otherwise → `streamAgentResponse`: provider.stream() with system prompt from `agent.personality`.

The HR hiring keyword list is duplicated in `web/src/components/ChatView.vue` so the UI can show a "generating candidates" placeholder before the data part arrives. Keep them in sync.

### Wire protocol — Vercel AI SDK v1 data stream (hand-rolled)

The server writes the line-prefixed protocol directly to the Express `Response`:

- Headers: `Content-Type: text/event-stream`, `x-vercel-ai-data-stream: v1`
- `0:<json-string>\n` — text chunk
- `2:<json-array>\n` — data parts. `CANDIDATES_LIST` payload now also carries `sessionId` and `toolCallId` so the client can POST `/api/chat/tool-result`.
- `d:<json>\n` — finish (always written before `res.end()`)

The Vue client (`ChatView.vue`) parses this format manually via `getReader()` + `TextDecoder` + line buffer + colon split.

### Multi-turn HR flow

1. User: `@hr find me a senior backend dev` → `POST /api/chat`.
2. Server creates session, picks provider, calls `provider.stream({ tools: [present_candidates], sessionId })`.
3. LLM streams some chat text (optional), then calls `present_candidates({candidates: [3]})`.
4. Tool handler:
   - Persists candidates to RxDB (`status: 'CANDIDATE'`).
   - Writes the `CANDIDATES_LIST` data part to the still-open `res` (the live chat fetch).
   - Returns an awaitable Promise registered in `ChatSessionStore`.
5. User clicks a card → browser fires `POST /api/chat/tool-result` (separate request) with `{sessionId, toolCallId, candidateId}`.
6. Endpoint flips the candidate to `HIRED`, resolves the pending Promise with `{status:'hired', candidate}`.
7. Tool handler returns to the model, which streams its acknowledgement message ("Great, I've hired Alice…") on the original chat response.
8. Stream ends.

Timeout: 10 minutes per pending tool call. If the user closes the tab, `res.on('close')` aborts the session's `AbortController`, which kills the CLI subprocess.

### Candidate generation (Gemini fallback)

`CandidateGeneratorService` is kept only for the Gemini-CLI provider. It uses a prompted-JSON approach: the LLM is asked to return strict JSON, the service extracts and validates with zod, and `CANDIDATES_LIST` is streamed without a `sessionId`/`toolCallId`. The frontend detects the missing tool-call info and falls back to `POST /api/agents/hire` (with a manual acknowledgement message).

### Frontend

Composition-API only. Composables in `web/src/composables/` define module-level `ref`s **outside** the exported function, so they act as singletons (`useAgents` caches the list across components, `useSettings` triggers `fetchSettings()` on first import). Be careful adding state — putting it inside the function makes it per-caller.

Path alias `@` → `./src` (configured in both `vite.config.ts` and `tsconfig.app.json`).

## Conventions

### ESM imports in the server

`server/tsconfig.json` uses `"module": "nodenext"`. **All relative imports must include the `.js` extension** even though the source is `.ts` (e.g. `import { AppModule } from './app.module.js'`). Forgetting this breaks the build silently for new files.

### LLM credentials live in the DB, not env

Don't read `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` from `process.env` at module load. The user configures them through the Settings UI; provider implementations pass them to the spawned subprocess (or `ChatOpenAI` ctor) explicitly. The only env vars the server depends on are `PORT` (optional, default `3000`) and `SILICON_SOULS_HOME` (optional, default `~/.silicon-souls`).

### CLI binaries

CLI providers run the binary directly on the host. The user must have it on `PATH` and (optionally) be logged in. `provider.checkConnection()` `which`'s the binary first and returns a friendly install hint if missing:

- Claude: `npm i -g @anthropic-ai/claude-code`
- Codex: `npm i -g @openai/codex`
- Gemini: `npm i -g @google/gemini-cli`

### Linting

- Server: ESLint w/ `typescript-eslint` recommended-type-checked + Prettier. `@typescript-eslint/no-explicit-any` is **off**; `no-floating-promises` and `no-unsafe-argument` are **warn**.
- Web: oxlint (correctness category, error) runs first, then ESLint with Vue + TypeScript configs. Always run `npm run lint` (the composite), not the sub-tasks alone.
