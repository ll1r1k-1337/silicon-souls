# Architecture

This document describes how Silicon Souls is put together: backend modules,
the chat routing pipeline, the LangChain structured-output flow, the
hand-rolled streaming protocol on the wire, and the Vue frontend state model.

For a higher-level overview see the [root README](../README.md).
For the original technical contract see [Step 0.md](Step%200.md).

---

## Stack

| Layer    | Choice                                                       |
| -------- | ------------------------------------------------------------ |
| Frontend | Vue 3 (Composition API), Vite, Tailwind v4, Headless UI Vue  |
| Backend  | NestJS 11 (ESM), Express adapter, TypeScript                 |
| LLM      | `@langchain/openai` (`ChatOpenAI`) + `zod` structured output |
| DB       | PostgreSQL 16, `drizzle-orm` over `postgres-js`              |
| Dev      | `docker compose` orchestrates all three services             |

---

## Data model

`server/src/database/schema.ts` is the single source of truth. There are no
generated migrations — schema changes are pushed with `drizzle-kit push`.

### `system_settings`

A trivial key-value table. The only key the app reads/writes is `'llm'`, whose
JSONB value holds the configured LLM provider settings.

| Column | Type                         | Notes                                  |
| ------ | ---------------------------- | -------------------------------------- |
| key    | `varchar(50)` primary key    | always `'llm'` today                   |
| value  | `jsonb`                      | `{ baseURL?, apiKey, modelName }`      |

### `agents`

| Column        | Type                                              | Notes                          |
| ------------- | ------------------------------------------------- | ------------------------------ |
| id            | `uuid` default random, primary key                |                                |
| handle        | `varchar(50)` unique not null                     | `hr`, `alice`, etc.            |
| name          | `varchar(100)` not null                           | display name                   |
| role          | `varchar(100)` not null                           | job title                      |
| personality   | `text` not null                                   | used as the system message     |
| status        | `varchar` enum `'CANDIDATE' \| 'HIRED'`           | default `'CANDIDATE'`          |
| metadata      | `jsonb`                                           | see below                      |
| createdAt     | `timestamp` default now                           |                                |

`metadata` is typed as

```ts
{
  skills?: string[];
  expected_salary?: string;   // snake_case in JSONB
  hr_comment?: string;        // snake_case in JSONB
}
```

The snake_case keys inside the JSONB are intentional (referenced as
string-keys in `agents.service.ts` and `candidate-generator.service.ts`).

### `messages`

Present in the schema but **not currently used by any service**. There is no
persistence of the chat transcript today; the conversation lives only in the
Vue component state.

| Column     | Type                                  | Notes                              |
| ---------- | ------------------------------------- | ---------------------------------- |
| id         | `uuid` default random, primary key    |                                    |
| senderType | `varchar` enum `'USER' \| 'AGENT'`    | not null                           |
| senderId   | `uuid` references `agents.id`         | nullable (e.g. for user messages)  |
| content    | `text` not null                       |                                    |
| createdAt  | `timestamp` default now               |                                    |

---

## Backend modules

```
AppModule
|-- ConfigModule (global, dotenv via 'dotenv/config' in main.ts)
|-- DatabaseModule  (@Global)
|     `-- provides DRIZZLE (Symbol) -> drizzle(postgres(DATABASE_URL), { schema })
|-- SettingsModule
|     `-- /api/settings           GET / PUT / POST :check
|-- AgentsModule
|     `-- /api/agents             GET active / POST hire
`-- ChatModule
      |-- imports AgentsModule, SettingsModule
      `-- /api/chat               POST (streaming)
```

### `DatabaseModule`

Declared `@Global`, exposes a single Nest provider keyed by the `DRIZZLE`
symbol. The provider is the `postgres-js`-backed Drizzle client constructed
from `process.env.DATABASE_URL`. Every DB-touching service injects it via
`@Inject(DRIZZLE) private readonly db: DrizzleDB`.

### `SettingsService`

Three concerns:

1. **Read** (`getSettings`): selects the `'llm'` row out of `system_settings`,
   returns `null` if missing. Used by `ChatService` and the controller.
2. **Write** (`updateSettings`): insert-or-update with a select-then-write
   pattern (no `ON CONFLICT`).
3. **Probe** (`checkConnection`): instantiates a `ChatOpenAI` with
   `maxTokens: 5` and invokes a one-token prompt to verify reachability. The
   apiKey here is supplied by the caller in the request body, not loaded from
   the DB — so the form's current draft can be tested before saving.

`SettingsController` masks the API key on read: `apiKey.slice(0,6) + '...' +
apiKey.slice(-4)`. PUT requests still take the raw key.

### `AgentsService`

Three operations:

- `findByHandle(handle)` — selects the agent and returns `null` if its
  `status !== 'HIRED'`. This is the gate that prevents the chat router from
  dispatching to candidates that haven't been hired yet.
- `getActiveAgents()` — selects `(handle, name)` for all `HIRED` agents.
- `hireCandidate(id)` — sets `status = 'HIRED'`, returns `true` if any row
  was updated.
- `createCandidates(rows)` — bulk insert with `status: 'CANDIDATE'`. The
  caller passes the LangChain-structured payload, which uses **camelCase**
  fields (`expectedSalary`, `hrComment`), and this service maps them to the
  **snake_case** keys that live in JSONB (`expected_salary`, `hr_comment`).

### `ChatService.handleChat` — the routing pipeline

The service receives the Express `Response` directly (via `@Res()`), which
gives it streaming control without buffering. Order matters:

1. Set SSE headers (`text/event-stream`, `Cache-Control: no-cache`,
   `Connection: keep-alive`, `x-vercel-ai-data-stream: v1`), then
   `res.flushHeaders()`.
2. `SettingsService.getSettings()`. If missing, stream a "configure settings
   first" message and end.
3. Take `messages[messages.length - 1]`. If absent or not `role: 'user'`,
   error out.
4. Match `/@([a-zA-Z0-9_]+)/` on the content. No mention -> tell the user to
   `@`-mention an agent.
5. `AgentsService.findByHandle(handle)`. Null result (either nonexistent or
   not hired) -> "Agent not found".
6. If `handle === 'hr'` **and** `isHiringIntent(content)`:
    -> `handleHiringRequest` -> `CandidateGeneratorService.generate`.
   Otherwise:
    -> `streamAgentResponse` (plain `ChatOpenAI.stream` of the conversation
   with the agent's personality as the system message).
7. Any thrown error from inside this pipeline is caught and emitted as a
   single text chunk prefixed with `Error:`.

#### `isHiringIntent`

A keyword bag: `['hire', 'find', 'recruit', 'need a', 'looking for', 'search
for', 'candidate', 'developer', 'engineer', 'designer', 'manager', 'new team
member']`. The check is `lower.includes(keyword)`. Brittle by design — see
the [review](review.md) for a discussion of failure cases.

> **The same list is duplicated** in `web/src/components/ChatView.vue`
> (`isHiringIntent`) so the UI can render a "generating candidates"
> placeholder before the data part arrives. **Keep them in sync.**

### `CandidateGeneratorService`

Uses `llm.withStructuredOutput(candidateSchema)` where `candidateSchema` is

```ts
z.object({
  replyMessage: z.string(),
  candidates: z
    .array(
      z.object({
        handle: z.string(),
        name: z.string(),
        role: z.string(),
        personality: z.string(),
        skills: z.array(z.string()),
        expectedSalary: z.string(),
        hrComment: z.string(),
      }),
    )
    .length(3),   // exactly three
});
```

Each field has a `.describe(...)` annotation that LangChain forwards into the
tool/function schema sent to the model, which materially improves output
quality on smaller models.

Generated candidates are persisted with `status: 'CANDIDATE'` and the inserted
rows (with their new DB UUIDs) are zipped back with the generator output so
the response includes the IDs that `POST /api/agents/hire` expects.

The reply text is **streamed word-by-word with a 30 ms delay** between words.
This is purely cosmetic — the underlying `structuredLlm.invoke` call is not
streaming; the words are tokenized client-side in Node before being written
to the response.

---

## The wire protocol

The server emits the Vercel AI SDK **v1 data-stream protocol**, hand-rolled
(no use of the `ai` package helpers). Headers:

```
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
x-vercel-ai-data-stream: v1
```

Line-prefixed records on the body:

| Prefix | Payload                                | Meaning                            |
| ------ | -------------------------------------- | ---------------------------------- |
| `0:`   | JSON string                            | text chunk; concatenate            |
| `2:`   | JSON array of data parts               | structured side-data               |
| `d:`   | JSON `{ finishReason, usage, ... }`    | terminal record, then `res.end()`  |

The only data part this project emits is

```json
[{ "type": "CANDIDATES_LIST", "payload": [ { "id", "handle", "name", "role", "skills", "expectedSalary", "hrComment" } ] }]
```

A finish record is **always written** before `res.end()`, even on the
short-circuited error paths (`sendTextStream`).

### Client-side parsing

The Vue client (`ChatView.vue`) does **not** use `@ai-sdk/vue`'s `useChat()`
despite the package being installed. It parses the format manually:

```
response.body.getReader() + TextDecoder({ stream: true })
-> buffer.split('\n')        // pop incomplete tail back to buffer
   for each line:
     colonIdx = line.indexOf(':')
     prefix  = line.slice(0, colonIdx)
     payload = line.slice(colonIdx + 1)
     prefix '0' -> append JSON.parse(payload) to the assistant message
     prefix '2' -> for each part of type 'CANDIDATES_LIST', attach payload
     prefix 'd' -> ignored
```

If you change the wire format on either side, update the other.

---

## Frontend architecture

### State ownership

The Vue app has no router or store. State lives in three places:

1. **`useAgents()` composable** — singleton-style. The `agents` ref is
   declared at module scope **outside** the exported function, so every
   import shares the same reactive array. `useAgents()` is called from
   `App.vue` (sidebar), `ChatView.vue` (so `handleHire` can `refresh()`
   after a hire), and `ChatInput.vue` (autocomplete list). All three see the
   same data without prop drilling.

2. **`useSettings()` composable** — same singleton pattern (`settings`,
   `checking`, `checkResult`, `configured` all at module scope). Used by
   `SettingsPanel.vue`.

3. **`ChatView.vue`** — owns `messages: ref<Message[]>([])` and `isLoading`.
   The conversation is **not persisted** across reloads.

When adding new composables, follow the existing pattern: state at module
scope acts as a singleton; state inside the exported function would be
per-caller.

### Component tree

```
App.vue
|-- aside (sidebar)
|   |-- active-agents list   (from useAgents)
|   `-- Settings button -> opens SettingsPanel
|-- main
|   `-- ChatView.vue
|       |-- Timeline.vue            v-for over messages
|       |   |-- MessageBubble.vue   one per message
|       |   `-- CandidateCard.vue   one per candidate, only when
|       |                           message.candidates is set
|       `-- ChatInput.vue
|           `-- @-autocomplete popover (Headless UI not used; rolled by hand)
`-- SettingsPanel.vue                modal, Headless UI Dialog
```

### Message shape

```ts
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  agentHandle?: string
  agentName?: string
  candidates?: Candidate[]
  isGeneratingCandidates?: boolean
}
```

While the stream is in flight, the assistant message has:

- `content: ''` (filled incrementally by `0:` chunks)
- `isGeneratingCandidates: true` if the client guessed (using its own copy of
  `isHiringIntent`) that HR will return candidates -> Timeline renders three
  shimmer cards.

When the `2:CANDIDATES_LIST` data part arrives, `candidates` is set and
`isGeneratingCandidates` is reset.

### Hire flow

When `CandidateCard` emits `hire`, `Timeline` adds the parent message id to a
local `hiddenCandidateGroups` set after a 1.2 s delay (so the success state
on the button is visible), and `ChatView.handleHire`:

1. `POST /api/agents/hire` with the candidate id.
2. On `{ success: true }`: `refreshAgents()` so the sidebar updates, then
   appends a local `"Candidate has been hired"` assistant message.

The `CandidateCard.handleHire` method itself also has an 800 ms cosmetic
delay; the actual API call happens in `ChatView`, not in the card. See the
[review](review.md) for the misleading TODO comment in that file.

### Styling

Tailwind v4 with the new `@theme` block in `web/src/assets/main.css`. All
design tokens (`--color-surface-*`, `--color-accent-*`, `--color-text-*`,
`--color-glass-*`) are CSS variables, referenced from templates via
`var(--color-foo)`. There are three custom keyframes (`fade-in-up`,
`pulse-glow`, `slide-in-right`) and a `.glass` utility for the
backdrop-blurred surface look.

---

## Conventions

### ESM imports in `server/`

`tsconfig.json` uses `"module": "nodenext"`. **All relative imports must
include the `.js` extension** even though sources are `.ts`:

```ts
import { AppModule } from './app.module.js';        // correct
import { AppModule } from './app.module';           // breaks at runtime
```

Forgetting the `.js` extension breaks the build silently for newly added
files (the existing scaffolding file `src/app.controller.ts` is an example;
see the review).

### LLM credentials live in the DB

Do not read `OPENAI_API_KEY` from `process.env`. The only env var the server
reads is `DATABASE_URL`. Everything LLM-related is loaded via
`SettingsService.getSettings()`.

### Linting

- **server**: ESLint w/ `typescript-eslint` recommended-type-checked + Prettier.
  `@typescript-eslint/no-explicit-any` is **off**;
  `no-floating-promises` and `no-unsafe-argument` are **warn**.
- **web**: oxlint (correctness, error) runs first, then ESLint with Vue +
  TypeScript configs. Always run the composite `npm run lint`.
