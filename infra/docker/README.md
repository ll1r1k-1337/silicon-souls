# Stage 0 Local Infrastructure

The root `docker-compose.yml` starts the local PostgreSQL database required by the Stage 0 API and worker.

```bash
docker compose up -d postgres
pnpm install
pnpm db:migrate
pnpm dev
```
