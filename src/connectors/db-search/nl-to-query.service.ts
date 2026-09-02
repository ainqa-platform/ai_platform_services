import { BadRequestException, Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../llm-gateway/llm-gateway.service';
import { LlmMessage } from '../../llm-gateway/interfaces/llm-provider.interface';

export type NlDecision = { action: 'clarify'; question: string } | { action: 'query'; sql: string };

export interface NlToQueryConfig {
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Calls the LLM with the usecase's curated schema description
 * (SchemaIntrospectionService), recent conversation history, and the user's
 * English question, and parses its response into either a clarifying
 * question or a QueryIntent. Deliberately asks for real SQL rather than a
 * structured filter object (table/columns/filters/aggregation) -- verified
 * against the actual target schema (primarycareng_sit) that a structured
 * intent can't express what's needed here: multi-table joins (patient ->
 * person for names), JSONB field access (person.name), and fuzzy ILIKE
 * matching against inconsistent free-text columns
 * (ca_chiefcomplaints.code/patient_complaint). The safety net is
 * QueryValidatorService treating this SQL as untrusted input -- an AST
 * check, not trust in the model's output -- matching the "if free-text SQL
 * generation is required for expressiveness, treat the LLM output as
 * untrusted input to the validator" fallback in the approved plan.
 *
 * The clarify branch and "always include human-identifying columns" rule
 * exist because a bare id/MRN answer to a question like "list patients with
 * fever" isn't useful to a clinician reading the chat -- the model is
 * instructed to join in name/age/gender by default and to ask which fields
 * matter only when a default genuinely doesn't apply (mirrors the same
 * clarify pattern already used by db-analytics/analytics-agent.service.ts).
 */
@Injectable()
export class NlToQueryService {
  constructor(private readonly llmGatewayService: LlmGatewayService) {}

  async decide(
    history: HistoryTurn[],
    question: string,
    schemaDescription: string,
    config: NlToQueryConfig,
  ): Promise<NlDecision> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt(schemaDescription) },
      ...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
      { role: 'user', content: question },
    ];

    const response = await this.llmGatewayService.chat({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 600, // a clarify question or one SQL statement -- never needs more
      messages,
    });

    return this.parseDecision(response.content);
  }

  private systemPrompt(schemaDescription: string): string {
    return [
      'You translate an English question into a single read-only PostgreSQL SELECT statement, or ask one ' +
        "clarifying question first when the request is genuinely ambiguous. You think like a helpful analyst, " +
        "not a literal query compiler: the goal is an answer a human can actually read and act on.",
      '',
      'Human-readable output (important):',
      '- When rows represent people (e.g. patients), never return just an id/MRN by itself -- join in and ' +
        'include identifying/contextual columns as well, such as name, age (or date of birth), and gender, ' +
        'whenever those columns are documented below and joinable. Do this by default, without being asked.',
      '- Only skip those extra columns if the user explicitly asked for just a specific field (e.g. "just give ' +
        'me the MRNs") or if none of name/age/gender are documented for the relevant table.',
      '- Alias columns to clear, human names (e.g. `full_name`, `age`, `gender_code`) rather than leaving cryptic ' +
        'source column names in the output.',
      '',
      'Ask before guessing:',
      '- If you cannot tell which fields the user wants, which table/condition they mean, or the request is ' +
        "ambiguous in some other way a sensible default can't resolve, respond with a clarifying question " +
        'instead of guessing wildly.',
      "- Don't ask just to confirm a safe default (e.g. whether to include name/age/gender -- always include " +
        'them per the rule above); only ask when genuinely unclear.',
      '',
      'Respond with ONLY one of these two JSON shapes (no prose, no code fence):',
      '{"action": "clarify", "question": "<one clear, specific question>"}',
      '{"action": "query", "sql": "<single read-only PostgreSQL SELECT statement>"}',
      '',
      'Rules for the SQL: use ONLY the tables and columns documented below (never invent one); exactly one ' +
        'SELECT statement; no INSERT/UPDATE/DELETE/DROP/ALTER/CREATE/TRUNCATE, no CTEs that write, no multiple ' +
        'statements; prefer ILIKE with wildcards over exact `=` matches on free-text columns (the schema notes ' +
        'flag which ones); always include a LIMIT.',
      '',
      'Schema:',
      schemaDescription,
    ].join('\n');
  }

  private parseDecision(content: string): NlDecision {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = (fenced ? fenced[1] : content).trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      // Defensive fallback: some models answer with bare/fenced SQL despite
      // the JSON instruction above -- salvage that rather than failing the
      // whole turn on a formatting slip.
      const sqlFenced = content.match(/```sql\s*([\s\S]*?)```/i);
      if (sqlFenced) {
        return { action: 'query', sql: sqlFenced[1].trim().replace(/;+\s*$/, '') };
      }
      throw new BadRequestException('Agent response was not valid JSON and contained no SQL to salvage');
    }

    if (parsed.action === 'clarify') {
      if (typeof parsed.question !== 'string' || !parsed.question.trim()) {
        throw new BadRequestException('Agent clarify response is missing a question');
      }
      return { action: 'clarify', question: parsed.question };
    }

    if (parsed.action === 'query') {
      if (typeof parsed.sql !== 'string' || !parsed.sql.trim()) {
        throw new BadRequestException('Agent query response is missing "sql"');
      }
      return { action: 'query', sql: parsed.sql.replace(/;+\s*$/, '') };
    }

    throw new BadRequestException(`Agent response had an unknown "action": ${String(parsed.action)}`);
  }
}
