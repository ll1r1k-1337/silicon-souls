# Code review

A review of the Stage 0 PoC against the Step 0 contract, the code itself, and
general code-quality concerns. Findings are grouped by severity. Each item
lists the file and line(s) so the fix can be located quickly.

## Summary

The project is in a healthy shape for a PoC. The architecture in
[`architecture.md`](architecture.md) cleanly maps to the spec in
[`Step 0.md`](Step%200.md). Major omissions: the `messages` table is unused
(no transcript persistence) and the `@ai-sdk/vue` `useChat` hook is not used
despite being a dependency. Below: 3 bugs, 4 dead-code items, 6 design /
maintainability notes, and 4 security / robustness notes.

---

## Bugs

### B1. E2E test will fail — `AppController` not wired into `AppModule`

`server/test/app.e2e-spec.ts` hits `GET /` and expects `"Hello World!"`, but
`server/src/app.module.ts` does not register `AppController` or `AppService`.
The only registered modules are `Database`, `Settings`, `Agents`, `Chat`.
Running `npm run test:e2e` returns 404, not 200.

Fix: either (a) delete the unused scaffolding files and the e2e test entirely
(see D1), or (b) add `controllers: [AppController], providers: [AppService]`
to `AppModule`.

`server/src/app.module.ts:8-16`, `server/test/app.e2e-spec.ts:19-24`

### B2. `useSettings()` re-fetches on every call

`web/src/composables/useSettings.ts:74` calls `fetchSettings()` unconditionally
at the end of the composable. Compare to `useAgents` which guards with
`if (agents.value.length === 0)`. Each component that imports `useSettings`
will reissue `GET /api/settings`.

Today only `SettingsPanel.vue` calls it, so the impact is one extra request
per dialog open. But the singleton pattern is broken in a way that will bite
when the composable is reused.

Fix: gate the auto-fetch on a module-scoped boolean flag (`fetched`), mirror
the `useAgents` pattern.

`web/src/composables/useSettings.ts:73-74`

### B3. Streamed assistant messages render with no name label

`ChatView.handleSend` creates the assistant message with only `agentHandle`:

```ts
const assistantMsg: Message = {
  id: assistantId, role: 'assistant', content: '',
  agentHandle: extractHandle(content),
  isGeneratingCandidates: isHiring,
}
```

`MessageBubble.vue:42` only renders the name label when `message.agentName`
is set — for streamed responses it never is, so the assistant bubble shows
just a single-letter "A" avatar and no name row. Meanwhile the seeded mock
data in `mockData.ts` includes `agentName`, so design mockups look fine but
the live app looks worse.

Fix: after the chat call succeeds, look up the agent in the `useAgents()`
list and patch `agentName` onto the message. Alternative: have the server
include the agent's name as a data part on the first chunk.

`web/src/components/ChatView.vue:36-44`, `web/src/components/MessageBubble.vue:42-48`

---

## Dead code

### D1. NestJS scaffolding files are not used

`server/src/app.controller.ts`, `app.service.ts`, `app.controller.spec.ts`,
and `server/test/app.e2e-spec.ts` are leftovers from `nest new`. None of
them are referenced from `AppModule`. The unit spec passes in isolation but
the e2e spec fails (see B1).

Also: `app.controller.ts:2` imports `from './app.service'` without the `.js`
extension. With `"module": "nodenext"`, wiring this controller into the app
would throw `ERR_MODULE_NOT_FOUND` at runtime. Currently dormant.

Fix: delete the four files. If you want a health endpoint, write a fresh one
that respects the ESM `.js`-suffix convention.

`server/src/app.controller.ts`, `server/src/app.service.ts`,
`server/src/app.controller.spec.ts`, `server/test/app.e2e-spec.ts`

### D2. `@ai-sdk/vue` and `ai` packages are unused

`web/package.json` lists both `ai@^6.0.170` and `@ai-sdk/vue@^3.x`. The Vue
client parses the data stream by hand in `ChatView.vue` and never imports
either package. The Step 0 contract explicitly calls for `useChat()` from
`@ai-sdk/vue` — this is a deviation.

Either: (a) drop the dependencies (saves install size), or (b) wire
`useChat()` properly in `ChatView` and replace the manual reader loop.

`web/package.json:18,20`

### D3. `mockData.ts` is imported nowhere

`web/src/composables/mockData.ts` exports `mockMessages` but no component
imports it. `ChatView.vue` initializes `messages: ref<Message[]>([])`.

Fix: delete the file. If you want a demo state, seed `messages.value` from
`mockMessages` on mount only when `import.meta.env.DEV` and a query param is
set.

`web/src/composables/mockData.ts`

### D4. `watch` imported but unused in `ChatView.vue`

`import { ref, watch, nextTick } from 'vue'` — only `ref` and `nextTick` are
used. The oxlint/ESLint chain should pick this up; check it isn't being
silently ignored.

`web/src/components/ChatView.vue:2`

---

## Design and maintainability

### M1. Hiring intent is detected by keyword bag

`ChatService.isHiringIntent` (and its frontend twin in `ChatView.vue:161`)
match any message containing one of: `hire`, `find`, `recruit`, `need a`,
`looking for`, `search for`, `candidate`, `developer`, `engineer`, `designer`,
`manager`, `new team member`.

False positives are easy:

- `@hr what was the salary expectation of our last hire?` -> triggers candidate
  generation.
- `@hr can you find the contract template?` -> triggers candidate generation.
- `@hr the senior engineer wants a raise` -> triggers candidate generation.

Once a false positive happens, the user has paid for an LLM call **and** has
three junk candidates persisted with `status: 'CANDIDATE'`.

Options:

- Move intent detection into the LLM itself: give HR a `generateCandidates`
  tool and let `bind_tools` decide. This is what the LangChain agent
  abstraction is for.
- Or, add a second cheap classification call (`maxTokens: 3`, "Is this a
  hiring request? yes/no").
- Or, keep the keyword bag but require **two** matches, or scope it to verbs.

### M2. Duplicated `isHiringIntent` between server and client

The server uses it for routing; the client uses it to show the candidate
shimmer placeholder before the data part arrives. Drifting the lists silently
breaks the UI placeholder.

Options: ship a server-emitted "expecting candidates" data part on the very
first chunk (e.g., `2:[{ "type": "EXPECT_CANDIDATES" }]`) so the client
doesn't need a second copy of the logic. Or, move the keyword list into a
shared module if you eventually adopt a monorepo manager (turbo, nx, pnpm
workspaces).

`server/src/chat/chat.service.ts:83-100`, `web/src/components/ChatView.vue:161-168`

### M3. Misleading TODO in `CandidateCard.vue`

```ts
async function handleHire() {
  hiring.value = true
  // TODO: Replace with real API call: POST /api/agents/hire
  await new Promise((r) => setTimeout(r, 800))
  hired.value = true
  hiring.value = false
  emit('hire', props.candidate.id)
}
```

The TODO is wrong: the real call **is** made, just from the parent (`ChatView.handleHire`).
The `setTimeout(800)` is purely cosmetic. The current implementation also
shows "Hired" optimistically before the parent confirms, so a server-side
failure will leave the UI claiming success.

Fix: remove the TODO. Either delete the artificial delay and trust the
parent's response, or hoist the API call into this component and remove the
parent's copy so there's one source of truth.

`web/src/components/CandidateCard.vue:16-23`

### M4. Messages table exists in schema but is never written

`messages` was specified in Step 0 (sec. 2) but no service references it.
Chat history lives in the Vue component and dies on reload. If transcript
persistence isn't part of the Stage 0 scope, consider either:

- Removing the table from the schema until it's used (avoids dead schema), or
- Wiring a `MessagesService` that records each user/assistant exchange (which
  also gives "load previous conversation" for free).

`server/src/database/schema.ts:39-47`

### M5. Settings auto-save vs. password-manager UX

`SettingsPanel.handleSave` calls `useSettings.saveSettings`. After save, the
form state retains the API key, but `useSettings.fetchSettings` (called next
time the dialog opens, see B2) sets `settings.apiKey` back to `''` because
"API key is masked from server, don't overwrite form". This is the right
choice from a security standpoint, but it means a user re-opening the dialog
and clicking **Check Connection** without re-typing the key gets a confusing
"401" — there's no key in the form.

Fix: disable the **Check Connection** button when the form's apiKey is empty
**but** the server reports `configured: true`, and add a hint ("Re-enter the
API key to test"). Or, allow the form to use the stored key implicitly via
a server-side `POST /api/settings/check-stored` endpoint.

`web/src/composables/useSettings.ts:25`, `web/src/components/SettingsPanel.vue:172-185`

### M6. Floating promises

`useAgents.refresh()` is called without `await` in two places
(`useAgents.ts:23`, `ChatView.vue:179`). The server's eslint config has
`@typescript-eslint/no-floating-promises` as **warn** — these would show up
in `npm run lint`. They're harmless in practice but indicate the rule isn't
being enforced.

Fix: either await them, mark them `void`, or upgrade the rule to `error`.

`web/src/composables/useAgents.ts:23`, `web/src/components/ChatView.vue:179`

---

## Security and robustness

### S1. API key stored plaintext in JSONB

`system_settings.value` holds `{ baseURL, apiKey, modelName }` as JSONB.
Anyone with `SELECT` on the table can read it. For a localhost PoC this is
acceptable, but document it as a known limitation, and rotate the key if the
DB image is ever exported.

Future hardening: encrypt at rest with a server-side AES key from env, or
push the secret into a vault and store only an identifier.

### S2. No request validation

The DTOs (`{ messages }`, `{ candidateId }`, `LlmSettings`) are typed in
TypeScript but **not validated at runtime**. NestJS supports
`class-validator` + `ValidationPipe` out of the box — a single
`app.useGlobalPipes(new ValidationPipe({ whitelist: true }))` in `main.ts`
plus DTO classes would close this.

Today, a malformed `POST /api/chat` body throws somewhere mid-pipeline and
the user sees the stack message inside an "Error: ..." text chunk.

### S3. Candidate `handle` collisions are unhandled

`agents.handle` is `UNIQUE NOT NULL`. The LLM occasionally picks duplicate
handles (e.g., same canonical names across multiple hiring requests, or
collisions with the seeded `hr`). The `createCandidates` bulk insert is a
single `INSERT ... VALUES (...), (...), (...)` so a unique violation
rejects **all three** rows. The user sees an "Error: ..." chunk and pays for
the LLM call with no candidates persisted.

Fix: catch the unique-violation, suffix the handle with a short random
string (`alice_dev_xa2f`), and retry once. Or, generate the handles
server-side from the candidate name instead of trusting the LLM output.

`server/src/agents/agents.service.ts:41-71`, `server/src/chat/candidate-generator.service.ts:54-73`

### S4. CORS hardcoded to `:5173`/`:5174`

`server/src/main.ts:9-12`. Fine for the PoC; brittle for a deployment.

Fix: read from `process.env.CORS_ORIGINS` (comma-separated list), fall back
to the two localhost ports.

---

## Minor / nits

- `web/.prettierrc.json` sets `semi: false` while `server/.prettierrc` keeps
  semicolons. Both are valid styles, just unusual to mix in one repo.
- `server/package.json` lists `ai@^6.0.170` as a dependency on the server; it
  isn't imported anywhere. The server hand-rolls the protocol. Drop it.
- `server/src/main.ts:18` calls `bootstrap()` without handling the returned
  promise. Add `.catch(...)` or `void bootstrap()` to silence the
  floating-promises warning consistently.
- The 30 ms-per-word "stream" of HR's reply in `handleHiringRequest` is
  decorative latency. It adds ~1 s for a 30-word reply. Either acknowledge
  that as deliberate UX or drop it.
- `seed.ts` doesn't `await client.end()` inside `.catch` — on a failure path
  the postgres connection lingers until process exit. Minor, but if seeds
  ever start failing in CI it shows up as hung jobs.
- `server/src/database/database.providers.ts:12` uses the non-null assertion
  on `process.env.DATABASE_URL!`. A friendlier error
  (`throw new Error('DATABASE_URL is required')`) helps debugging when the
  variable is unset.

---

## Recommended next steps, ranked

1. Fix B3 (assistant messages missing name) — most visible UX issue.
2. Decide on `messages` table (M4) — either wire it or drop it.
3. Replace keyword-based intent detection with a tool call (M1).
4. Delete the dead `app.*` scaffolding and `mockData.ts` (D1, D3); update the
   e2e test or remove it (B1).
5. Add `class-validator` DTOs and a global `ValidationPipe` (S2).
6. Handle candidate-handle collisions (S3).
7. Use `useChat()` from `@ai-sdk/vue` or drop the dependency (D2).
