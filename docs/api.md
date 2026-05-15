# API reference

All endpoints are served by the NestJS app on port `3000`. The Vite dev
server proxies `/api/*` to it. CORS is whitelisted to `http://localhost:5173`
and `:5174`.

There is no authentication. There are no rate limits. This is a local PoC.

---

## `GET /api/agents/active`

Lists agents with `status = 'HIRED'`. Used by the sidebar and the
`@`-autocomplete popover.

**Response** `200 OK`

```json
{
  "agents": [
    { "handle": "hr", "name": "HR Manager" },
    { "handle": "alice", "name": "Alice Chen" }
  ]
}
```

---

## `POST /api/agents/hire`

Flips a candidate's status to `'HIRED'`. Idempotent (a re-hire of an already
hired agent is allowed and returns `true`).

**Request**

```json
{ "candidateId": "<uuid>" }
```

**Response** `200 OK`

```json
{ "success": true }
```

`success: false` if no row matched the id.

---

## `GET /api/settings`

Returns the configured LLM provider settings with the API key **masked**.

**Response — not configured** `200 OK`

```json
{ "configured": false, "settings": null }
```

**Response — configured** `200 OK`

```json
{
  "configured": true,
  "settings": {
    "baseURL": "https://api.openai.com/v1",
    "apiKey": "sk-abc...wxyz",
    "modelName": "gpt-4o-mini"
  }
}
```

The masked apiKey is `apiKey.slice(0,6) + '...' + apiKey.slice(-4)` — purely
for display. The frontend never sends this back; the input field stays empty
on load.

---

## `PUT /api/settings`

Upserts the `'llm'` row in `system_settings`.

**Request**

```json
{
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "modelName": "gpt-4o-mini"
}
```

`baseURL` is optional. If omitted, the OpenAI default is used.

**Response** `200 OK`

```json
{ "success": true }
```

---

## `POST /api/settings/check`

Probes whether the supplied credentials are reachable. Does **not** persist
them. Implementation invokes the model with `maxTokens: 5` and the prompt
`"Say \"ok\""`.

**Request**

```json
{
  "baseURL": "https://api.openai.com/v1",
  "apiKey": "sk-...",
  "modelName": "gpt-4o-mini"
}
```

**Response** `200 OK`

```json
{ "success": true, "message": "Connection successful! Model is reachable." }
```

or

```json
{ "success": false, "message": "Connection failed: <reason>" }
```

---

## `POST /api/chat`

Streams the assistant response. The body is `text/event-stream` with the
Vercel AI SDK v1 data-stream protocol — see
[`architecture.md`](architecture.md#the-wire-protocol) for the on-the-wire
format.

**Request**

```json
{
  "messages": [
    { "role": "user", "content": "@hr find me a backend engineer" }
  ]
}
```

Only the last message is inspected for routing; the full history is forwarded
to the LLM as conversation context (when going through `streamAgentResponse`).

**Response headers**

```
Content-Type:               text/event-stream
Cache-Control:              no-cache
Connection:                 keep-alive
x-vercel-ai-data-stream:    v1
```

**Response body** — newline-separated records.

Text chunks (one or many):
```
0:"Hello "
0:"world!"
```

Data part (only on HR hiring intents):
```
2:[{"type":"CANDIDATES_LIST","payload":[{"id":"...","handle":"...","name":"...","role":"...","skills":["..."],"expectedSalary":"...","hrComment":"..."}]}]
```

Finish (always last):
```
d:{"finishReason":"stop","usage":{"promptTokens":0,"completionTokens":0},"isContinued":false}
```

**Failure modes that still return a successful 200 stream** (each ends with a
single text chunk followed by `d:`):

| Trigger                                       | Streamed text                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `system_settings` has no `'llm'` row          | "Please configure LLM settings first. Click the Settings button..."        |
| Last message is missing or not `role: 'user'` | "No user message found."                                                   |
| No `@handle` mention                          | "Please mention an agent using @handle. Type @ to see available agents."   |
| Handle not found OR not `HIRED`               | "Agent @<handle> not found or not hired yet."                              |
| Exception during dispatch                     | "Error: <message>"                                                         |

A non-2xx HTTP status is **not** used for these cases; the response is always
a stream.
