# server — Silicon Souls backend

NestJS 11 (ESM) API for the Silicon Souls chat workspace.

For project-level docs see the [root README](../README.md). For the chat
routing pipeline and module breakdown see
[`docs/architecture.md`](../docs/architecture.md).

## Quickstart

Inside Docker (recommended; from repo root):

```bash
docker compose up
```

Outside Docker:

```bash
cd server
echo "DATABASE_URL=postgresql://postgres:postgres@localhost:5432/silsol" > .env
npm install
npx drizzle-kit push       # one-time schema sync
npm run build && npm run seed
npm run start:dev
```

The server listens on `http://localhost:3000`. CORS is whitelisted to the
Vite dev server (`:5173` / `:5174`); see `src/main.ts`.

## Scripts

```bash
npm run start:dev          # watch-mode Nest
npm run build              # compile to dist/
npm run seed               # idempotently insert @hr (requires build first)
npm run lint               # ESLint --fix
npm test                   # Jest unit tests (*.spec.ts under src/)
npm run test:e2e           # Jest with test/jest-e2e.json
npx jest path/to/file.spec.ts          # single file
npx jest -t "test name"                # single test by name
```

## Configuration

| Variable       | Default                                                | Required |
| -------------- | ------------------------------------------------------ | -------- |
| `DATABASE_URL` | `postgresql://postgres:postgres@postgres:5432/silsol`  | yes      |
| `PORT`         | `3000`                                                 | no       |

LLM credentials (Base URL, API key, model name) are **not** environment
variables — they are stored in the `system_settings` table and configured at
runtime through the web app's Settings panel.

## Database

The schema in `src/database/schema.ts` is the source of truth. There are no
generated migrations; push it to Postgres with:

```bash
npx drizzle-kit push
```

(Inside Docker: `docker compose exec server npx drizzle-kit push`.)

`src/database/seed.ts` inserts the `@hr` agent with `status: 'HIRED'`. It is
idempotent and runs automatically on every container start.

## ESM gotcha

`tsconfig.json` uses `"module": "nodenext"`. All relative imports **must**
include the `.js` extension even in `.ts` source:

```ts
import { AppModule } from './app.module.js';        // correct
import { AppModule } from './app.module';           // breaks at runtime
```

## API surface

See [`docs/api.md`](../docs/api.md) for the full endpoint reference.

```
GET    /api/agents/active           list hired agents
POST   /api/agents/hire             flip a candidate to HIRED

GET    /api/settings                read LLM settings (apiKey masked)
PUT    /api/settings                upsert LLM settings
POST   /api/settings/check          probe credentials (no persistence)

POST   /api/chat                    streaming chat (Vercel AI SDK v1 data stream)
```
