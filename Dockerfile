# syntax=docker/dockerfile:1

FROM node:22-alpine AS base

WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable && corepack prepare pnpm@9.15.4 --activate

COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/llm-contracts/package.json packages/llm-contracts/package.json
COPY packages/spec-format/package.json packages/spec-format/package.json

RUN pnpm install --frozen-lockfile=false

COPY . .

FROM base AS api
EXPOSE 3000
CMD ["pnpm", "--filter", "@sdd/api", "start:docker"]

FROM base AS worker
CMD ["pnpm", "--filter", "@sdd/api", "worker"]

FROM base AS web
EXPOSE 5173
CMD ["pnpm", "--filter", "@sdd/web", "dev"]
