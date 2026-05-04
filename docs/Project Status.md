# Silicon Souls Project Status

Last inspected: 2026-05-04

## Overview

Silicon Souls is currently a Stage 0 proof of concept for an AI agent workspace. The target in `docs/Step 0.md` is a Vue 3 chat interface backed by a Nest.js API, PostgreSQL persistence through Drizzle ORM, LLM-based agent routing, HR-driven candidate generation, and a hiring flow that promotes generated candidates into active agents.

The repository already contains a functional-looking split between `server`, `web`, and `docs`. The backend implements the main API surface and LLM orchestration, while the frontend implements the chat experience, settings panel, candidate display, and active-agent UI. The implementation is close to the Stage 0 shape, with several important gaps around exact SDK usage, migrations, persistence, tests, and cleanup.

## Backend Status

The backend is a Nest application with modules for database access, settings, agents, and chat.

Implemented pieces:

- Drizzle schema exists for the required `system_settings`, `agents`, and `messages` tables in `server/src/database/schema.ts`.
- `/api/chat` is implemented through `ChatController` and `ChatService`.
- `/api/agents/hire` updates an agent candidate to `HIRED`.
- `/api/agents/active` returns hired agents as `{ handle, name }`.
- Additional `/api/settings` endpoints exist for reading, saving, and checking LLM provider settings.
- Chat routing extracts the last user message, requires an `@handle`, checks that the mentioned agent exists and is hired, and routes normal responses through LangChain `ChatOpenAI.stream()`.
- HR hiring requests are detected through keyword matching when the mentioned handle is `@hr`.
- Candidate generation uses LangChain structured output with a Zod schema requiring `replyMessage` and exactly three candidates.
- Generated candidates are inserted into the `agents` table with `CANDIDATE` status and metadata for skills, expected salary, and HR comments.
- A seed script exists to create the initial hired `hr` agent.

Notable backend gaps:

- The `messages` table exists but the current chat flow does not appear to persist user or agent messages.
- No generated Drizzle migration folder is present at `server/drizzle`.
- The backend uses Nest 11 packages. Step 0 requested Nest 10+, so this is compatible, but not exactly the likely original baseline.
- Some comments and user-facing strings in source files show mojibake characters, suggesting an encoding issue.
- Error streams are implemented, but several messages differ from the exact Step 0 wording.

## Frontend Status

The frontend is a Vue 3 application using Tailwind CSS and Headless UI.

Implemented pieces:

- The app shell includes a sidebar with active agents and a settings button.
- `SettingsPanel.vue` uses Headless UI dialog components for LLM provider configuration.
- `ChatView.vue` owns the message timeline, sends chat requests to `/api/chat`, reads streamed responses, and handles hiring.
- `ChatInput.vue` implements `@handle` autocomplete from `/api/agents/active`.
- `Timeline.vue`, `MessageBubble.vue`, and `CandidateCard.vue` render chat messages and candidate cards.
- Candidate cards are hidden after a hire action, a local confirmation message is shown, and the active agents list is refreshed.
- Vite proxies `/api` requests to the backend at `http://localhost:3000`.

Notable frontend gaps:

- Step 0 specifies `useChat()` from `@ai-sdk/vue`, but the current frontend manually posts to `/api/chat` and parses the Vercel AI data stream protocol itself.
- `CandidateCard.vue` still contains a mock delay and TODO before emitting the hire event. The real API call is performed by `ChatView.vue` after the event bubbles up.
- Candidate card hiding and success messaging are implemented locally, but the flow is split across `CandidateCard`, `Timeline`, and `ChatView`.
- Agent names are available in the sidebar/autocomplete, but assistant messages do not appear to be enriched with `agentName`, so bubbles usually show the generic assistant avatar label.
- Some UI strings also show mojibake characters.

## Infrastructure And Tooling

Implemented pieces:

- `docker-compose.yml` defines Postgres, server, and web services.
- Postgres uses database `silsol`, user `postgres`, and password `postgres`.
- The server service runs `npm install && npm run start:dev`.
- The web service runs `npm install && npm run dev -- --host`.
- Backend and frontend dependencies are installed locally under each project directory.

Current limitations:

- `server/dist` exists locally but is not tracked by git.
- No generated migration files were found.
- There is no root-level package manager workspace; `server` and `web` are separate Node projects.

## Tests And Verification

Current automated test coverage is minimal.

- Only the default Nest `AppController` spec exists.
- No meaningful tests were found for chat routing, candidate generation, agent hiring, settings, database access, or frontend behavior.
- `npm test` in `server` was attempted but could not run because `npm` is not available on the current PowerShell PATH.
- `npm run type-check` in `web` was attempted but could not run for the same reason.
- `git status --short` was clean during inspection.

## Current Assessment

The project has a substantial Stage 0 implementation in place. The core backend contracts exist, the main chat and hiring workflows are represented in code, and the frontend provides a usable AI-agent workspace experience.

The main work remaining before calling Stage 0 solid is to align the frontend with the requested `@ai-sdk/vue` integration or explicitly accept the manual stream parser, generate and track Drizzle migrations, decide whether chat messages should be persisted, replace mock behavior in `CandidateCard.vue`, add focused tests around the core flows, and clean up encoding issues in comments and user-facing strings.
