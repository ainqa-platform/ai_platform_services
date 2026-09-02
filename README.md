# ainqa-ai-platform server

Orchestration backend for the **AI Usecases** feature (`/ai-usecases` in the
frontend — a card-based launcher; admin CRUD lives at `/ai-usecases/manage`):
a NestJS + TypeORM/Postgres service that lets an admin define reusable AI
"usecases" (chat, file Q&A, natural-language database search, database
analytics/charts) and lets an end user run them from a generic chat UI with
live progress updates. See
[`../docs/USER_GUIDE_USECASES.md`](../docs/USER_GUIDE_USECASES.md) for the
end-to-end walkthrough and
[`../docs/APPLICATION_OVERVIEW.md`](../docs/APPLICATION_OVERVIEW.md) §13 for
how this fits into the rest of the frontend app.

This is a sibling service to the React app in the parent folder, not a
package inside it — it has its own `package.json`, its own dependency tree,
and runs as its own process on its own port.

## Prerequisites

- Node.js >= 20
- A Postgres database (the `pgvector` extension is only required if you plan
  to use `file_qa` usecases with `vectorStore.type: "pgvector"`; the default,
  `chroma`, needs a reachable ChromaDB instance instead — see `CHROMA_URL`
  below)

## Setup

```bash
cd server
npm install
cp .env.example .env   # then fill in the values below
npm run migration:run  # creates the ai_platform schema/tables
npm run start:dev      # http://localhost:4000, restarts on file change
```

Production-style run (no watch/reload):

```bash
npm run build
npm run start
```

## Required configuration (`server/.env`)

All variables are validated at startup against a zod schema
(`src/config/configuration.ts`) — the process refuses to start and logs the
specific field errors if anything required is missing or malformed.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string for the `ai_platform` schema (usecases, secrets, documents, conversation history). |
| `SECRETS_MASTER_KEY` | yes, to create/run usecases | 64-char hex string (32 raw bytes) used to AES-256-GCM encrypt model API keys and DB credentials at rest. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. Without it, creating a usecase (which always stores its API key as a Secret first) fails. |
| `JWT_VERIFY_KEY` / `JWT_ALGORITHM` | no | Verifies the same JWT the frontend already stores after login (`localStorage["UserInfo"]`, decoded via `safeDecodeJWT`), issued by the external IDM service. If left unset, the server decodes the token without verifying its signature and logs a startup warning — fine for local dev, fill in before anything resembling production. |
| `PORT` | no (default `4000`) | HTTP + Socket.IO port. Must match `REACT_APP_AI_PLATFORM_API_URL` in the frontend's `.env`. |
| `CORS_ORIGIN` | no (default `http://localhost:3000`) | Must match wherever the frontend is actually served from. |
| `LANGFUSE_SECRET_KEY` / `LANGFUSE_PUBLIC_KEY` / `LANGFUSE_BASE_URL` | no | Server-side Langfuse tracing for every usecase dispatch (`orchestrator.service.ts`). Omitting these just means no traces are recorded — the app still works. |
| `CHROMA_URL` / `CHROMA_TENANT` / `CHROMA_DATABASE` / `CHROMA_AUTH_TOKEN` | required for `file_qa` usecases using the default `vectorStore.type: "chroma"` | Connection to the shared ChromaDB instance. **Security note:** treat this as a sensitive, ops-owned value — do not point it at a shared/public instance without auth enabled (`CHROMA_AUTH_TOKEN`). |
| `PRIMARYCARENG_SIT_DATABASE_URL` | required for `db_search`/`db_analytics` usecases that use the `primarycareng_sit` Postgres source | One env var per named data source an admin can pick from when configuring a usecase (see `usecases/dto/usecase-config.schema.ts`'s `connectionKey`). Add more of these as more sources are provisioned — a usecase only ever references a source by its key, never a raw connection string. |

## Database migrations

Schema is owned entirely by TypeORM migrations under
`src/database/migrations/` — `synchronize` is hard-disabled in both
`app.module.ts` and `data-source.ts`. Never rely on auto-sync; always go
through:

```bash
npm run migration:run      # apply all pending migrations
npm run migration:revert   # roll back the most recent one
npm run migration:generate -- src/database/migrations/NNNN_description
```

## What this service does (API surface)

All routes below require `Authorization: Bearer <token>` (the same JWT the
frontend already holds) and live under `http://localhost:4000` by default.

| Route | Purpose |
|---|---|
| `GET /api/health` | Unauthenticated liveness check. |
| `GET /api/usecases`, `GET /api/usecases/:id`, `POST /api/usecases`, `PATCH /api/usecases/:id`, `DELETE /api/usecases/:id` | CRUD for usecase definitions. `config` is validated server-side against a per-`type` zod schema — the four types are `chat`, `file_qa`, `db_search`, `db_analytics` (`usecases/dto/usecase-config.schema.ts`). |
| `POST /api/secrets` | Write-only: encrypts a model API key or DB credential and returns only its `id` (a `secretRef` to put in a usecase's `config`). There is no route that ever returns a decrypted or ciphertext value. |
| `POST /api/usecase/:id/documents` | Upload a document (PDF/DOCX/CSV/image/plain text, max 25MB) to a `file_qa` usecase for ingestion (extract → chunk → embed → upsert into the usecase's vector store). Ingestion runs in the background; the response document starts at `status: "pending"`. There is currently **no frontend UI** for this — see the user guide for a `curl` example. |
| `POST /api/usecase/:id/message` | Non-streaming: send a message to a usecase and get back one `{ answer, chartSpec?, citations?, meta }`, with no progress updates along the way. Not called by the frontend runner UI anymore (see below) — kept for non-UI/programmatic callers. |
| Socket.IO namespace `/usecase-chat`, event `usecase:message` → (`usecase:status`\* → `usecase:chunk`\*) → `usecase:done` (or `usecase:error`) | **What the frontend runner actually uses, for all four usecase types.** `usecase:status` events carry human-readable progress text ("Reading the data dictionary...", "Generating a query..."); `usecase:chunk` events carry answer text — token-by-token for `chat`/`file_qa`, or as a single chunk for `db_search`/`db_analytics` once ready. `usecase:done` carries the full `{ answer, chartSpec?, citations?, meta }`. Optional `sourceId` in the emitted payload picks which of a usecase's `config.sources` to query (`db_search`/`db_analytics` only). Auth token is passed as `socket.handshake.auth.token`, not a header. |

## Architecture at a glance

- **`usecases/`** — CRUD + the per-type config schema/validation.
- **`secrets/`** — AES-256-GCM at-rest encryption for API keys/DB credentials; `reveal()` is server-side-only, never exposed over HTTP.
- **`orchestrator/`** — the dispatch layer: loads a usecase, picks the connector for its `type`, wraps the call in a Langfuse trace. `orchestrator.controller.ts` is the non-streaming HTTP path (`connector.run()`); `orchestrator.gateway.ts` is the Socket.IO path every usecase type's frontend UI actually uses (`connector.runStream()`), relaying each yielded chunk as `usecase:status` (progress) or `usecase:chunk` (answer text) before a final `usecase:done`.
- **`connectors/`** — one implementation per usecase type, all behind the same `UsecaseConnector` interface (`connector.interface.ts`). Every connector implements `runStream()` (an async generator yielding `{status}` and/or `{delta}` chunks, returning the final `ConnectorResult`); `run()` is implemented via the interface's `drainStream()` helper, which just drains that same generator and discards the yielded chunks — so there's one code path per connector, not two:
  - `chat/` — a plain LLM call through `llm-gateway/`, with a "Thinking..." status chunk before the stream starts.
  - `file-qa/` — retrieval-augmented chat: embed the query, kNN-search the usecase's vector store (`vector-store/`), inject top-K chunks as context, then call `llm-gateway/` — with status chunks for the search and retrieval steps. `file-qa/ingestion/` is the upload-time pipeline (extractors for PDF/DOCX/CSV/image-OCR → chunk → embed → upsert).
  - `db-search/` — natural-language question → curated data-dictionary-grounded LLM decision (`nl-to-query.service.ts`) that either asks a clarifying question or generates SQL → AST-based validation/allowlist → execute, for a Postgres source; or an LLM tool-selection decision (`mcp-tool-call.service.ts`, same clarify-or-query shape) → call, for an MCP source. Renders results as a markdown table. The system prompt instructs the model to default to human-readable columns (e.g. join in name/age/gender alongside an id/MRN) rather than a bare identifier, and to ask when genuinely unsure which fields are wanted. Records conversation turns via `ConversationHistoryService` (see below) so a clarifying question's follow-up is understood in context, and streams a `status` chunk before each major step (reading the data dictionary, generating the query, running it, formatting results).
  - `db-analytics/` — like `db-search` but agentic and chart-producing: the agent (`analytics-agent.service.ts`) can ask a clarifying question before committing to a query, and shapes the result into a `ChartSpec` the frontend renders with MUI X Charts. Same per-step `status` streaming as `db-search`.
- **`llm-gateway/`** — a single `openai-compatible` provider (chat/stream/embeddings) that every connector calls through.
- **`mcp/`** — spawns and talks to MCP servers over stdio. `mcp-servers/cerner-fhir/` is the only one wired up today: a standalone MCP server wrapping Cerner/Oracle Health's public, unauthenticated FHIR R4 sandbox (an internal `serverKey` for backend wiring only — the frontend never shows this name to end users; a usecase's source `label` is admin-authored freeform text).
- **`vector-store/`** — a small provider interface (`vector-store.interface.ts`) implemented by `providers/chroma.provider.ts` and `providers/pgvector.provider.ts`; `vectorStore.service.ts` picks one per usecase.
- **`conversation/`** — recent-turn history per `(usecaseId, sessionId)`, used by both `db-search` and `db-analytics`'s clarify-then-query loop so a follow-up message is interpreted in context.
- **`observability/`** — the server-side Langfuse client (keeps the secret key out of the browser bundle, unlike the frontend's own Langfuse usage documented in the parent app's overview).

## Known limitations (current slice)

- Document ingestion runs in-process, fire-and-forget — a server restart
  mid-ingestion leaves a document stuck at `status: "processing"` rather than
  retrying. Fine for this slice; revisit with a durable job queue (e.g.
  BullMQ) before real production volume.
- `PRIMARYCARENG_SIT_DATABASE_URL` currently reuses the same Postgres
  superuser credential as `DATABASE_URL` — there is no dedicated read-only
  role provisioned yet. The AST-based query validator (single `SELECT`,
  table allowlist, no DDL/DML) is the safety layer in the meantime, not a
  substitute for a real read-only role.
- Only one MCP server (`cerner_sandbox`) is wired up; adding another is a new
  `serverKey` entry in `mcp/mcp-client.service.ts` plus the config schema's
  enum, not a structural change.
