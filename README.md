# SDD AI Company - Stage 0

Stage 0 is a local-first spec-driven-development workspace. It turns a raw product idea into a structured, reviewed, versioned and approved product specification that can be exported as a Stage 1 input bundle.

## Stack

- API: NestJS, TypeScript, Drizzle ORM, PostgreSQL
- Worker: DB-backed background jobs, no Redis/BullMQ on Stage 0
- LLM: LangChain.js provider abstraction with OpenAI adapter and mock fallback
- Web: Vue 3, Vite, Pinia, Vue Router, custom dark-first tokenized UI
- Shared packages: domain types, Zod schemas, LLM contracts, spec formatting/diff/export helpers

## Local Development

```bash
docker compose up -d
```

Services:

- API: `http://localhost:3000/api`
- Web: `http://localhost:5173`
- PostgreSQL: `localhost:5432`

Stop all services:

```bash
docker compose down
```

Reset local database data:

```bash
docker compose down -v
```

Manual non-container development is still available:

```bash
pnpm install
docker compose up -d postgres
pnpm db:migrate
pnpm dev
pnpm worker
```

If `OPENAI_API_KEY` is not set, the worker uses a deterministic mock LLM provider so the flow can be tested locally without external API calls.

LLM provider settings can also be configured from the UI. Open the Settings drawer and set an OpenAI-compatible `BASE_URL`, `API_KEY`, and model. Saved UI settings are stored in PostgreSQL and take precedence over `.env` values without requiring an API or worker restart.

## Main Flow

1. Create a project.
2. Start a spec session from a raw idea.
3. Send messages or commands in the conversation panel.
4. Worker extracts artifacts and asks clarification questions.
5. Generate a draft Markdown specification.
6. Run review and resolve blocking issues.
7. Approve the specification.
8. Export Markdown, JSON, or Stage 1 bundle.
