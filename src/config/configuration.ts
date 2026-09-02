import { z } from 'zod';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  SECRETS_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'SECRETS_MASTER_KEY must be a 64-char hex string (32 bytes)')
    .optional()
    .or(z.literal('')),
  JWT_VERIFY_KEY: z.string().optional().or(z.literal('')),
  JWT_ALGORITHM: z.string().default('HS256'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  LANGFUSE_SECRET_KEY: z.string().optional().or(z.literal('')),
  LANGFUSE_PUBLIC_KEY: z.string().optional().or(z.literal('')),
  LANGFUSE_BASE_URL: z.string().optional().or(z.literal('')),

  // ChromaDB connection -- one server-wide instance, see vector-store/
  // providers/chroma.provider.ts. Per-usecase config only ever picks
  // `vectorStore.type: 'chroma'` (+ an optional collection name), never a
  // host/port -- connection endpoints are ops-owned config, not something
  // typed into a usecase form (same reasoning as DATABASE_URL).
  CHROMA_URL: z.string().optional().or(z.literal('')),
  CHROMA_TENANT: z.string().default('default_tenant'),
  CHROMA_DATABASE: z.string().default('default_database'),
  // Chroma's own auth is off by default; if/when it's turned on
  // (recommended -- see the security note from probing this instance),
  // set this to send `Authorization: Bearer <token>`.
  CHROMA_AUTH_TOKEN: z.string().optional().or(z.literal('')),

  // db_search/db_analytics data sources (see usecases/dto/usecase-config.schema.ts
  // `dataSource`, and db-search/executors/postgres.executor.ts). Each is a
  // named, ops-owned connection -- a usecase only ever picks the key, never
  // a raw connection string. SECURITY: this currently reuses the same
  // Postgres superuser credential as DATABASE_URL because no dedicated
  // read-only role has been provisioned yet -- the AST-based validator
  // (single SELECT, table allowlist, no DDL/DML) is the safety layer in
  // the meantime, not a substitute for a real read-only role. Provision one
  // and point this at it before relying on this for anything beyond
  // internal testing.
  PRIMARYCARENG_SIT_DATABASE_URL: z.string().optional().or(z.literal('')),
});

export type AppConfig = z.infer<typeof envSchema>;

export default function configuration(): AppConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid server configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid server configuration - see logged field errors above');
  }
  return parsed.data;
}
