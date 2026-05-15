# Silicon Souls

A local-first chat workspace where you talk to AI "agents" by `@handle`. An
always-on `@hr` agent can recruit on demand: ask it to find a developer,
designer, or any other role, and it generates three candidate agents via a
multi-turn LLM tool call. Hire one and they become addressable in subsequent
chats.

The Stage 0 PoC contract is preserved verbatim in
[`docs/Step 0.md`](docs/Step%200.md).

---

## Contents

- [Quickstart](#quickstart)
- [LLM providers](#llm-providers)
- [Project layout](#project-layout)
- [How it works](#how-it-works)
- [Configuration](#configuration)
- [Per-package commands](#per-package-commands)
- [Further reading](#further-reading)

---

## Quickstart

Requirements: Node 22+. No Docker, no database to install — state lives under
`~/.silicon-souls/` as a JSON file.

```bash
git clone <repo> && cd silicon-souls
npm run setup          # installs server + web packages
npm start              # builds web, builds server, starts on :3000
```

Open <http://localhost:3000> and click **Settings** in the sidebar. Pick a
provider, enter a model name (and API key if needed), click **Check
Connection**, then **Save Settings**. After that:

```
@hr find me a senior backend engineer
```

HR streams a short intro, then three candidate cards appear. Click one — the
selection is fed back to the LLM as a tool result and it streams a short
acknowledgement. The hired agent appears in the sidebar, ready to be
`@mention`-ed.

### Development (HMR)

```bash
# terminal 1
npm run dev:server     # Nest --watch on :3000
# terminal 2
npm run dev:web        # Vite on :5173, proxies /api → :3000
```

---

## LLM providers

The Settings panel lets you pick one of four providers:

| Provider                     | Tool calling | How                                                                 |
| ---------------------------- | ------------ | ------------------------------------------------------------------- |
| **OpenAI-compatible (HTTP)** | ✅           | `@langchain/openai` `ChatOpenAI` + `bindTools()`                    |
| **Claude Code CLI**          | ✅           | Spawns `claude -p … --mcp-config … --output-format stream-json`     |
| **OpenAI Codex CLI**         | ✅           | Spawns `codex exec --json --config 'mcp_servers.siliconsouls.…'`    |
| **Gemini CLI**               | ⚠️ fallback  | Spawns `gemini -p …`; HR uses a prompted-JSON path (no native tool) |

CLI providers run on the **host**, not in a container. Install whichever you
want to use:

```bash
npm i -g @anthropic-ai/claude-code   # claude
npm i -g @openai/codex               # codex
npm i -g @google/gemini-cli          # gemini
```

API keys are optional for CLI providers when you're already logged in via the
CLI's own auth flow (e.g. `claude login`). The "Check Connection" button
verifies the binary is on `PATH` and produces a friendly install hint otherwise.

---

## Project layout

```
.
|-- package.json           root scripts (setup / build / start / dev:*)
|-- server/                NestJS 11 (ESM) backend
|   `-- src/
|       |-- main.ts                  bootstrap + port
|       |-- app.module.ts            wires Database + LLM + Settings + Agents + Chat
|       |-- database/                RxDB module + schemas + JSON snapshot
|       |-- settings/                GET/PUT /api/settings + POST /check
|       |-- agents/                  GET /active, POST /hire
|       |-- chat/                    POST /api/chat (streaming), session store, /tool-result
|       `-- llm/                     provider interface + 4 implementations,
|                                    internal MCP server, present_candidates tool
|-- web/                   Vue 3 + Vite + Tailwind v4 frontend
|   `-- src/
|       |-- App.vue                  sidebar + main pane
|       |-- components/              ChatView, ChatInput, Timeline,
|       |                            MessageBubble, CandidateCard,
|       |                            SettingsPanel
|       |-- composables/             useAgents, useSettings, mockData
|       `-- types.ts
|-- docs/
|   |-- Step 0.md                    original technical contract
|   |-- architecture.md
|   |-- api.md
|   `-- review.md
`-- CLAUDE.md                        guidance for Claude Code sessions
```

---

## How it works

A user message goes through this pipeline on the server:

```
POST /api/chat
  |
  v
ChatService.handleChat
  1. create a session (UUID + per-session MCP token) in ChatSessionStore
  2. fetch LLM settings; if missing, prompt to configure
  3. require role === 'user' on the last message
  4. regex /@([a-zA-Z0-9_]+)/ → handle (or error)
  5. AgentsService.findByHandle → only returns HIRED agents
  6. if handle === 'hr' && isHiringIntent(content):
       - Gemini: prompted-JSON fallback via CandidateGeneratorService
       - else:   provider.stream({ tools: [present_candidates], sessionId })
                 → tool handler persists candidates, streams CANDIDATES_LIST,
                   blocks on a Promise resolved by POST /api/chat/tool-result
                 → LLM resumes with the user's selection as tool result
     else:
       - provider.stream(...) with personality as the system message
```

The response is the Vercel AI SDK v1 data-stream protocol (hand-rolled):
line-prefixed records on a `text/event-stream` body — `0:` for text chunks,
`2:` for data parts, `d:` for finish. The Vue client parses this manually in
`ChatView.vue`.

For the full pipeline (including the multi-turn tool flow and MCP plumbing),
see [`CLAUDE.md`](CLAUDE.md).

---

## Configuration

### Environment variables

| Variable              | Default                                    | Notes                          |
| --------------------- | ------------------------------------------ | ------------------------------ |
| `PORT`                | `3000`                                     | Server HTTP port.              |
| `SILICON_SOULS_HOME`  | `~/.silicon-souls`                         | Data directory (RxDB dump).    |

LLM credentials (provider type, base URL, API key, model name) are **not**
environment variables. They are stored in the local RxDB `systemSettings`
collection and configured at runtime through the Settings panel.

---

## Per-package commands

The root `package.json` proxies most operations, but you can drop into each
package for more granular control.

### server/

```bash
npm run start:dev      # watch-mode Nest
npm run build          # compile to dist/
npm run lint           # ESLint --fix
npm test               # Jest unit (*.spec.ts under src/)
npm run test:e2e       # Jest with test/jest-e2e.json
```

### web/

```bash
npm run dev            # Vite dev server
npm run build          # type-check + build-only
npm run type-check     # vue-tsc --build
npm run lint           # oxlint --fix, then eslint --fix
```

---

## Further reading

- **[`CLAUDE.md`](CLAUDE.md)** — instructions for Claude Code sessions working
  on this repo: architecture, wire protocol, MCP plumbing, ESM `.js` imports,
  conventions.
- **[`docs/Step 0.md`](docs/Step%200.md)** — the original technical contract.
- **[`docs/architecture.md`](docs/architecture.md)**,
  **[`docs/api.md`](docs/api.md)**,
  **[`docs/review.md`](docs/review.md)** — pre-pivot reference (parts now
  superseded by the local-first rewrite; updated material is in `CLAUDE.md`).
