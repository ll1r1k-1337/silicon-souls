# web — Silicon Souls frontend

Vue 3 (Composition API) + Vite + Tailwind v4 + Headless UI Vue. The chat
workspace UI for Silicon Souls.

For project-level docs see the [root README](../README.md). For component
breakdown and state model see
[`docs/architecture.md`](../docs/architecture.md).

## Quickstart

Inside Docker (recommended; from repo root):

```bash
docker compose up
```

Outside Docker:

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api/*` to `API_TARGET` (defaults to
`http://localhost:3000`; set to `http://server:3000` inside Compose).

## Scripts

```bash
npm run dev          # Vite dev server
npm run build        # parallel: type-check + build-only
npm run type-check   # vue-tsc --build
npm run lint         # composite: oxlint --fix, then eslint --fix
```

Always run the composite `npm run lint`. `lint:oxlint` runs first as a fast
correctness pre-pass.

## Path alias

`@` -> `./src` (configured in both `vite.config.ts` and `tsconfig.app.json`).

```ts
import type { Agent } from '@/types'
import { useAgents } from '@/composables/useAgents'
```

## State model

The app has no router or store. State lives in three places:

- `useAgents()` composable (singleton: state at module scope) — sidebar +
  autocomplete list.
- `useSettings()` composable (singleton) — settings modal.
- `ChatView.vue` — owns the messages array. The conversation is **not**
  persisted across reloads.

When adding a composable, follow the existing pattern: state declared at
module scope acts as a singleton across all callers. Declaring it inside the
exported function makes it per-caller.

## Wire protocol

`ChatView.vue` parses the streaming response from `POST /api/chat` manually
(line-prefixed records, `0:` = text, `2:` = data part, `d:` = finish). See
[`docs/api.md`](../docs/api.md) and
[`docs/architecture.md`](../docs/architecture.md#the-wire-protocol).

The `@ai-sdk/vue` and `ai` packages are listed in `package.json` but are not
currently imported; the protocol is hand-rolled on both sides. See the
[review](../docs/review.md#d2-ai-sdkvue-and-ai-packages-are-unused).

## Styling

Tailwind v4 with `@theme` in `src/assets/main.css`. Design tokens
(`--color-surface-*`, `--color-accent-*`, `--color-text-*`,
`--color-glass-*`) are CSS variables, referenced in templates as
`var(--color-foo)`. Three keyframes (`fade-in-up`, `pulse-glow`,
`slide-in-right`) and a `.glass` utility for the backdrop-blurred surface
look.

## IDE setup

[VS Code](https://code.visualstudio.com/) +
[Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar)
(and disable Vetur).

`vue-tsc` replaces the `tsc` CLI for type-checking `.vue` imports. In the
editor, Volar enables the Vue TypeScript language service.
