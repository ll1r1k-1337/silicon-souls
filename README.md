# Silicon Souls

A chat workspace where you talk to AI "agents" by `@handle`. An always-on `@hr`
agent can recruit on demand: ask it to find a developer, designer, or any other
role, and it generates three candidate agents via a structured LLM call. Hire
one and they become addressable in subsequent chats.

This is the Stage 0 proof-of-concept. The technical contract that the project
was built to is preserved verbatim in [`docs/Step 0.md`](docs/Step%200.md).

---

## Contents

- [Quickstart](#quickstart)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Per-package commands](#per-package-commands)
- [Further reading](#further-reading)

---

## Quickstart

Requirements: Docker (with Compose v2). Nothing else needs to be installed
locally — Node, Postgres, and dependencies run inside containers.

```bash
docker compose up
```

This brings up three services:

| Service    | URL                          | Notes                                         |
| ---------- | ---------------------------- | --------------------------------------------- |
| `postgres` | `localhost:5432`             | `silsol` db, user/pass `postgres/postgres`    |
| `server`   | `http://localhost:3000`      | NestJS API; runs `seed` then `start:dev`      |
| `web`      | `http://localhost:5173`      | Vite dev server with HMR                      |

The `server` container, on every start, runs:

```
npm install && npm run build && npm run seed && npm run start:dev
```

The `seed` step idempotently inserts the `@hr` agent so the workspace is never
empty.

Once the web app is up, open <http://localhost:5173>, click the **Settings**
button in the sidebar, and configure an OpenAI-compatible LLM endpoint (Base
URL, API key, model name). After saving, you can chat:

```
@hr find me a senior backend engineer
```

HR replies with three candidate cards. Click **Hire** on any of them and the
new agent appears in the sidebar, ready to be `@mention`-ed.

> The schema is not migrated automatically. On first run the seed will fail if
> the tables don't exist yet. To create them, see
> [Database schema](#database-schema) below.

### Database schema

There is no Drizzle migrations folder; the schema in
`server/src/database/schema.ts` is the source of truth. Push it to the running
Postgres:

```bash
docker compose exec server npx drizzle-kit push
```

Or, outside Docker (with `DATABASE_URL` set in `server/.env`):

```bash
cd server && npx drizzle-kit push
```

---

## Project layout

```
.
|-- docker-compose.yml      postgres + server + web
|-- server/                 NestJS 11 (ESM) backend
|   |-- src/
|   |   |-- main.ts                 bootstrap, CORS, port
|   |   |-- app.module.ts           wires DB + Settings + Agents + Chat
|   |   |-- database/               drizzle client, schema, seed
|   |   |-- settings/               GET/PUT /api/settings + POST /check
|   |   |-- agents/                 GET /active, POST /hire
|   |   `-- chat/                   POST /api/chat (streaming)
|   `-- drizzle.config.ts
|-- web/                    Vue 3 + Vite + Tailwind v4 frontend
|   `-- src/
|       |-- App.vue                 sidebar + main pane
|       |-- components/             ChatView, ChatInput, Timeline,
|       |                           MessageBubble, CandidateCard,
|       |                           SettingsPanel
|       |-- composables/            useAgents, useSettings, mockData
|       `-- types.ts
|-- docs/
|   |-- Step 0.md                   original technical contract
|   |-- architecture.md             deep dive: backend, frontend, wire protocol
|   |-- api.md                      REST endpoint reference
|   `-- review.md                   code review and known issues
`-- CLAUDE.md                       guidance file for Claude Code sessions
```

---

## How it works

A user message goes through this pipeline on the server:

```
POST /api/chat  (Vercel-AI-SDK-style data stream)
  |
  v
ChatService.handleChat
  1. fetch LLM settings (from system_settings table); if missing, prompt to configure
  2. take the last message; require role === 'user'
  3. regex /@([a-zA-Z0-9_]+)/ -> handle (or error)
  4. AgentsService.findByHandle -> only returns HIRED agents
  5. if handle === 'hr' && isHiringIntent(content)
        -> CandidateGeneratorService.generate
           - structured output (zod schema), exactly 3 candidates
           - persist with status='CANDIDATE'
           - stream the replyMessage word-by-word
           - append data part: { type: 'CANDIDATES_LIST', payload: [...] }
     else
        -> ChatOpenAI.stream() with personality as the system message
```

The response is the Vercel AI SDK v1 data-stream protocol (hand-rolled):
line-prefixed records on a `text/event-stream` body — `0:` for text chunks,
`2:` for data parts, `d:` for finish. The Vue client parses this format
manually in `ChatView.vue`.

For the full pipeline (including wire format details, candidate schema, and
frontend state model), see [`docs/architecture.md`](docs/architecture.md).

---

## Configuration

### Environment variables

| Variable       | Where         | Default                                                   | Notes                              |
| -------------- | ------------- | --------------------------------------------------------- | ---------------------------------- |
| `DATABASE_URL` | server        | `postgresql://postgres:postgres@postgres:5432/silsol`     | Required. Set by Compose.          |
| `PORT`         | server        | `3000`                                                    | Optional override.                 |
| `API_TARGET`   | web (Vite)    | `http://localhost:3000`                                   | Proxy target for `/api/*`.         |

LLM credentials (base URL, API key, model name) are **not** environment
variables. They are stored in the `system_settings` table and configured at
runtime through the Settings panel. This lets the PoC run anywhere with an
OpenAI-compatible endpoint (OpenAI, Azure, Ollama via `litellm`, local
vLLM/text-generation-inference, etc.).

### CORS

`server/src/main.ts` hardcodes the allowed origins to `http://localhost:5173`
and `http://localhost:5174`. Update that list to host the web app elsewhere.

---

## Per-package commands

There is no root `package.json` — run commands from inside each package.

### server/

```bash
npm run start:dev      # watch-mode Nest
npm run build          # compile to dist/
npm run seed           # build first; inserts @hr (idempotent)
npm run lint           # ESLint --fix
npm test               # Jest unit (*.spec.ts under src/)
npm run test:e2e       # Jest with test/jest-e2e.json
npx jest path/to/file.spec.ts          # single file
npx jest -t "test name"                # single test by name
```

### web/

```bash
npm run dev            # Vite dev server
npm run build          # parallel: type-check + build-only
npm run type-check     # vue-tsc --build
npm run lint           # oxlint --fix, then eslint --fix
```

Always run `npm run lint` (the composite); the sub-tasks (`lint:oxlint`,
`lint:eslint`) are not designed to be invoked individually.

---

## Further reading

- **[`docs/architecture.md`](docs/architecture.md)** — backend modules, the
  chat routing algorithm, the candidate-generation flow, the data-stream wire
  protocol, the frontend state model.
- **[`docs/api.md`](docs/api.md)** — REST endpoint reference with request and
  response shapes.
- **[`docs/review.md`](docs/review.md)** — code review: dead code, conformance
  to the Step 0 spec, known limitations, recommended follow-ups.
- **[`docs/Step 0.md`](docs/Step%200.md)** — the original technical contract
  the codebase was built against.
- **[`CLAUDE.md`](CLAUDE.md)** — instructions for Claude Code sessions working
  on this repo (conventions, gotchas, ESM `.js` imports, etc.).
