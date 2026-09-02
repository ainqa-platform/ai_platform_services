import { z } from 'zod';
import { BadRequestException } from '@nestjs/common';

/**
 * Per-type config shapes, as agreed in the plan. `secretRef` is a Secret id
 * (see secrets module) -- raw API keys/DB credentials are never accepted or
 * stored here. Validated server-side on every create/update; the client's
 * `config` payload is never trusted as-is.
 */
const chatConfigSchema = z.object({
  provider: z.literal('openai-compatible'),
  baseUrl: z.string().url(),
  modelName: z.string().min(1),
  secretRef: z.string().uuid(),
  temperature: z.number().min(0).max(2).default(0.1),
  topP: z.number().min(0).max(1).default(1),
  systemPrompt: z.string().default(''),
});

/**
 * Which vector store backend a file_qa usecase's chunks/embeddings live in.
 * Connection details (host, tenant, credentials) are server-level config
 * (CHROMA_URL etc. in server/src/config/configuration.ts), NOT entered per
 * usecase -- same reasoning as DATABASE_URL: infra endpoints are an ops
 * concern, not something an admin types into a usecase form. A usecase only
 * ever picks a `type` (+ an optional collection override for chroma); see
 * vector-store/vector-store.interface.ts for the provider contract both
 * types implement.
 */
const vectorStoreConfigSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pgvector') }),
  z.object({ type: z.literal('chroma'), collectionName: z.string().min(3).max(63).optional() }),
]);

const fileQaConfigSchema = z.object({
  provider: z.literal('openai-compatible'),
  baseUrl: z.string().url(),
  modelName: z.string().min(1),
  secretRef: z.string().uuid(),
  // No default here on purpose: "text-embedding-3-small" (the old default)
  // is an OpenAI-hosted model name that doesn't exist on DeepInfra -- the
  // right embedding model name is inherently provider-specific, so silently
  // defaulting to one provider's name would just as often be wrong.
  embeddingModel: z.string().min(1),
  chunkSize: z.number().int().positive().default(800),
  chunkOverlap: z.number().int().nonnegative().default(120),
  topK: z.number().int().positive().default(5),
  vectorStore: vectorStoreConfigSchema.default({ type: 'chroma' }),
});

/**
 * A hand-curated (not live-introspected) description of the tables/columns
 * a db_search/db_analytics usecase is allowed to query -- grounds the LLM's
 * SQL generation in `nl-to-query.service.ts`. Curated rather than
 * auto-sampled because real schemas have gotchas an LLM can't infer from
 * column names alone -- e.g. verified against `primarycareng_sit`:
 * `patient.personid` joins to `person._id` (NOT `person.personid`, which is
 * a different, string-typed field), and `ca_chiefcomplaints.code`/
 * `patient_complaint` hold inconsistent free text (slugs, sentences, or
 * short labels) that must be searched with ILIKE, never exact-matched.
 * `notes` is exactly where caveats like that belong.
 */
const dataDictionaryTableSchema = z.object({
  table: z.string().min(1),
  description: z.string().optional(),
  columns: z
    .array(z.object({ name: z.string().min(1), description: z.string().optional() }))
    .default([]),
  notes: z.string().optional(),
});

/**
 * A single queryable source within a db_search/db_analytics usecase. A
 * usecase can list several -- the end user picks which one to query per
 * question in the chat UI (not fixed at usecase-creation time), so one
 * agent can span e.g. the primary-care Postgres DB and the Cerner MCP
 * sandbox. `id` is what the chat UI sends back as `sourceId`, and what
 * ConversationHistoryService/connectors key off of alongside sessionId.
 *
 * Connection details are still server-owned config either way -- a source
 * only ever picks a `connectionKey`/`serverKey`, never a raw connection
 * string/URL, same reasoning as CHROMA_URL and DATABASE_URL elsewhere.
 */
const postgresDataSourceSchema = z.object({
  type: z.literal('postgres'),
  id: z.string().min(1),
  label: z.string().min(1),
  connectionKey: z.enum(['primarycareng_sit']),
  allowedCollectionsOrTables: z.array(z.string().min(1)).min(1),
  dataDictionary: z.array(dataDictionaryTableSchema).default([]),
});

/**
 * An MCP source exposes typed tools (not a query language) -- the agent
 * picks one tool + arguments per question (see
 * db-search/mcp-tool-call.service.ts) rather than generating SQL/AQL.
 * `allowedTools` is the equivalent safety allowlist to
 * `allowedCollectionsOrTables`: only these tool names may be called, even
 * if the MCP server exposes more. `cerner_sandbox` is the only server
 * wired up today (server/src/mcp-servers/cerner-fhir/server.ts, verified
 * live against Cerner's real open FHIR sandbox); adding another MCP server
 * later is a new serverKey + entry in mcp/mcp-client.service.ts, not a
 * schema change beyond this enum.
 */
const mcpDataSourceSchema = z.object({
  type: z.literal('mcp'),
  id: z.string().min(1),
  label: z.string().min(1),
  serverKey: z.enum(['cerner_sandbox']),
  allowedTools: z.array(z.string().min(1)).min(1),
});

const dataSourceSchema = z.discriminatedUnion('type', [postgresDataSourceSchema, mcpDataSourceSchema]);

const dbSearchConfigSchema = z.object({
  provider: z.literal('openai-compatible'),
  baseUrl: z.string().url(),
  modelName: z.string().min(1),
  secretRef: z.string().uuid(),
  sources: z.array(dataSourceSchema).min(1),
  rowLimit: z.number().int().positive().max(1000).default(200),
});

const dbAnalyticsConfigSchema = dbSearchConfigSchema.extend({
  chartTypesAllowed: z.array(z.enum(['bar', 'line', 'pie', 'scatter', 'table'])).min(1),
});

export const usecaseConfigSchemas = {
  chat: chatConfigSchema,
  file_qa: fileQaConfigSchema,
  db_search: dbSearchConfigSchema,
  db_analytics: dbAnalyticsConfigSchema,
} as const;

export type UsecaseTypeKey = keyof typeof usecaseConfigSchemas;
export type VectorStoreConfig = z.infer<typeof vectorStoreConfigSchema>;
export type DataDictionaryTable = z.infer<typeof dataDictionaryTableSchema>;
export type DataSourceConfig = z.infer<typeof dataSourceSchema>;
export type PostgresDataSourceConfig = z.infer<typeof postgresDataSourceSchema>;
export type McpDataSourceConfig = z.infer<typeof mcpDataSourceSchema>;

export function validateUsecaseConfig(type: string, config: unknown): Record<string, unknown> {
  const schema = usecaseConfigSchemas[type as UsecaseTypeKey];
  if (!schema) {
    throw new BadRequestException(`Unknown usecase type "${type}"`);
  }
  const result = schema.safeParse(config);
  if (!result.success) {
    throw new BadRequestException({
      message: `Invalid config for usecase type "${type}"`,
      errors: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}
