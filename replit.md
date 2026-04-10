# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **AI Integrations**: OpenAI (via Replit AI Integrations), Anthropic (via Replit AI Integrations)

## Artifacts

### API Server (`artifacts/api-server`)
- Express 5 backend serving on `/api` and `/v1`
- `/api/healthz` — health check
- `/v1/models` — OpenAI-compatible model list (no auth required)
- `/v1/chat/completions` — OpenAI-compatible chat completions proxy with Bearer token auth
  - Routes models starting with `gpt` or `o` → OpenAI
  - Routes models starting with `claude` → Anthropic (format-converts to OpenAI response shape)
  - Supports streaming (SSE) and non-streaming modes
  - 5-second keepalive pings on streaming connections
  - Body limit: 50mb

### API Portal (`artifacts/api-portal`)
- React + Vite frontend at `/` (preview path)
- Shows API docs, Base URL, model list, CherryStudio setup guide
- Detects online status via `/api/healthz`
- Dark theme

## AI Integrations
- OpenAI: `AI_INTEGRATIONS_OPENAI_BASE_URL`, `AI_INTEGRATIONS_OPENAI_API_KEY`
- Anthropic: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`
- Proxy auth key: `PROXY_API_KEY` (Bearer token for `/v1` routes)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
