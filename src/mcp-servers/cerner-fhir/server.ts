#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * A standalone MCP server (own process, spawned via stdio by mcp/mcp-client.service.ts
 * -- NOT part of the main Nest app's DI graph) wrapping Cerner/Oracle Health's
 * public FHIR R4 sandbox as MCP tools.
 *
 * There is no single official "Cerner MCP server" to just connect to -- verified
 * via web search before writing this. What IS real and verified directly (see
 * the conversation this was built in): Cerner's OPEN, unauthenticated,
 * read-only FHIR R4 sandbox at the URL below, documented at
 * https://docs.oracle.com/en/industries/health/millennium-platform-apis/mfrap/r4_overview.html
 * and confirmed live with a real CapabilityStatement + a real Patient search
 * (e.g. patient 12747063, "Smart On Fhir") before any of this was written.
 *
 * FHIR responses are flattened into plain row objects here (not passed
 * through as raw FHIR JSON) so the agent-side code
 * (mcp-tool-call.service.ts, db-search/db-analytics connectors) stays
 * source-agnostic: every source, Postgres or MCP, ultimately produces
 * `Record<string, unknown>[]` rows.
 */
const FHIR_BASE_URL =
  process.env.CERNER_FHIR_BASE_URL || 'https://fhir-open.cerner.com/r4/ec2458f2-1e24-41c8-b71b-0e701af7583d';

interface FhirBundle {
  resourceType: 'Bundle';
  total?: number;
  entry?: Array<{ resource: Record<string, unknown> }>;
}
interface FhirOperationOutcome {
  resourceType: 'OperationOutcome';
  issue?: Array<{ severity: string; details?: { text?: string } }>;
}

async function fhirGet(path: string): Promise<FhirBundle | Record<string, unknown>> {
  const response = await fetch(`${FHIR_BASE_URL}/${path}`, { headers: { Accept: 'application/fhir+json' } });
  const json = (await response.json()) as Record<string, unknown>;
  if (!response.ok || json.resourceType === 'OperationOutcome') {
    const outcome = json as unknown as FhirOperationOutcome;
    const message = outcome.issue?.map((i) => i.details?.text).join('; ') || `HTTP ${response.status}`;
    throw new Error(`Cerner FHIR request failed: ${message}`);
  }
  return json as FhirBundle | Record<string, unknown>;
}

function humanName(resource: Record<string, unknown>): string {
  const names = resource.name as Array<{ text?: string; family?: string; given?: string[] }> | undefined;
  const n = names?.[0];
  if (!n) return '';
  return n.text || [n.given?.join(' '), n.family].filter(Boolean).join(' ');
}

function codeableConceptText(cc: unknown): string {
  const c = cc as { text?: string; coding?: Array<{ display?: string; code?: string }> } | undefined;
  return c?.text || c?.coding?.[0]?.display || c?.coding?.[0]?.code || '';
}

function bundleRows(bundle: FhirBundle | Record<string, unknown>, map: (r: Record<string, unknown>) => Record<string, unknown>) {
  const entries = (bundle as FhirBundle).entry ?? [];
  return entries.map((e) => map(e.resource));
}

const server = new McpServer({ name: 'cerner-fhir-sandbox', version: '0.1.0' });

// `count` is a string field (parsed with parseCount below), not z.number() --
// verified necessary: z.number()-based fields hit a structural type mismatch
// against this SDK version's zod-compat layer ("ZodOptional<ZodNumber> is not
// assignable to AnySchema... missing _type, _output, _input, _def, and 33
// more"), which only affects numeric schemas -- all-string field sets compile
// fine. Rather than fight the SDK's compat typing, argument parsing does the
// int coercion instead.
function parseCount(value: string | undefined, fallback = 20): number {
  const n = value ? parseInt(value, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.min(n, 50) : fallback;
}

/**
 * registerTool()'s generic overloads hit TS's "Type instantiation is
 * excessively deep" (TS2589) once an inputSchema has ~5+ fields, against
 * this installed SDK+zod version combination -- and, once one call in the
 * file trips it, TS's overload-resolution cache makes even the following,
 * otherwise-fine calls fail too (verified: get_patient alone was fine, but
 * failed as soon as it followed the 6-field search_patients call). Rather
 * than fight that per-call, every tool is registered through this one
 * untyped choke point instead: the zod schemas still validate arguments
 * fully at runtime (that's zod's own job, independent of the MCP SDK's
 * static types), so nothing here is a real type-safety loss -- just a
 * workaround for this SDK version's static inference giving up.
 */
const registerTool = (server as { registerTool: (name: string, config: unknown, cb: (args: never) => Promise<unknown>) => void })
  .registerTool.bind(server);

interface SearchPatientsArgs {
  name?: string;
  family?: string;
  given?: string;
  birthdate?: string;
  identifier?: string;
  count?: string;
}

registerTool(
  'search_patients',
  {
    title: 'Search patients',
    description:
      'Search for patients in the Cerner FHIR sandbox. Params: name (full-text), family (last name), ' +
      'given (first name), birthdate (YYYY-MM-DD), identifier (MRN), count (max results as a string, default 20). ' +
      'At least one of name/family/given/birthdate/identifier is required -- the sandbox rejects unfiltered searches.',
    inputSchema: {
      name: z.string().optional(),
      family: z.string().optional(),
      given: z.string().optional(),
      birthdate: z.string().optional(),
      identifier: z.string().optional(),
      count: z.string().optional(),
    },
  },
  async (args: SearchPatientsArgs) => {
    const params = new URLSearchParams();
    if (args.name) params.set('name', args.name);
    if (args.family) params.set('family', args.family);
    if (args.given) params.set('given', args.given);
    if (args.birthdate) params.set('birthdate', args.birthdate);
    if (args.identifier) params.set('identifier', args.identifier);
    params.set('_count', String(parseCount(args.count)));

    const bundle = await fhirGet(`Patient?${params.toString()}`);
    const rows = bundleRows(bundle, (r) => ({
      id: r.id,
      name: humanName(r),
      gender: r.gender,
      birthDate: r.birthDate,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  },
);

registerTool(
  'get_patient',
  {
    title: 'Get a patient by id',
    description: 'Fetch a single patient by their Cerner FHIR patient id.',
    inputSchema: { patientId: z.string() },
  },
  async (args: { patientId: string }) => {
    const resource = (await fhirGet(`Patient/${encodeURIComponent(args.patientId)}`)) as Record<string, unknown>;
    const row = { id: resource.id, name: humanName(resource), gender: resource.gender, birthDate: resource.birthDate };
    return { content: [{ type: 'text', text: JSON.stringify([row]) }] };
  },
);

registerTool(
  'search_conditions',
  {
    title: 'Search a patient\'s conditions',
    description:
      'List a patient\'s recorded conditions/diagnoses (e.g. to check whether they have a given condition). ' +
      'Params: patientId (required), count (max results as a string, default 20).',
    inputSchema: { patientId: z.string(), count: z.string().optional() },
  },
  async (args: { patientId: string; count?: string }) => {
    const bundle = await fhirGet(`Condition?patient=${encodeURIComponent(args.patientId)}&_count=${parseCount(args.count)}`);
    const rows = bundleRows(bundle, (r) => ({
      id: r.id,
      condition: codeableConceptText(r.code),
      clinicalStatus: codeableConceptText(r.clinicalStatus),
      onsetDateTime: r.onsetDateTime,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  },
);

registerTool(
  'search_observations',
  {
    title: 'Search a patient\'s observations',
    description:
      'List a patient\'s observations (vitals, labs, etc.). Params: patientId (required), ' +
      'code (optional FHIR/LOINC observation code to filter by), count (max results as a string, default 20).',
    inputSchema: {
      patientId: z.string(),
      code: z.string().optional(),
      count: z.string().optional(),
    },
  },
  async (args: { patientId: string; code?: string; count?: string }) => {
    const params = new URLSearchParams({ patient: args.patientId, _count: String(parseCount(args.count)) });
    if (args.code) params.set('code', args.code);
    const bundle = await fhirGet(`Observation?${params.toString()}`);
    const rows = bundleRows(bundle, (r) => ({
      id: r.id,
      observation: codeableConceptText(r.code),
      value: (r.valueQuantity as { value?: number; unit?: string } | undefined)
        ? `${(r.valueQuantity as { value?: number }).value} ${(r.valueQuantity as { unit?: string }).unit ?? ''}`.trim()
        : (r.valueString as string | undefined),
      effectiveDateTime: r.effectiveDateTime,
    }));
    return { content: [{ type: 'text', text: JSON.stringify(rows) }] };
  },
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('cerner-fhir MCP server failed to start:', err);
  process.exit(1);
});
