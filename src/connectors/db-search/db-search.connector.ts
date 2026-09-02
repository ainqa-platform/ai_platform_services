import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { ConversationHistoryService } from '../../conversation/conversation-history.service';
import { McpClientService } from '../../mcp/mcp-client.service';
import { SecretsService } from '../../secrets/secrets.service';
import { DataSourceConfig } from '../../usecases/dto/usecase-config.schema';
import { UsecaseEntity } from '../../usecases/entities/usecase.entity';
import { ConnectorChunk, ConnectorMessageInput, ConnectorResult, UsecaseConnector, drainStream } from '../connector.interface';
import { PostgresExecutor } from './executors/postgres.executor';
import { McpToolCallService } from './mcp-tool-call.service';
import { NlToQueryService } from './nl-to-query.service';
import { QueryValidatorService } from './query-validator.service';
import { SchemaIntrospectionService } from './schema-introspection.service';

interface DbSearchConfig {
  baseUrl: string;
  modelName: string;
  secretRef: string;
  sources: DataSourceConfig[];
  rowLimit: number;
}

const HISTORY_TURNS = 10;

/**
 * Resolves which of the usecase's config.sources to query (input.sourceId,
 * chosen by the end user in the chat UI -- see connector.interface.ts),
 * then branches by source type:
 *  - postgres: read the curated data dictionary -> ask the LLM to either
 *    request clarification (e.g. which fields, which condition) or commit
 *    to a query (NlToQueryService, instructed to default to human-readable
 *    columns like name/age/gender rather than a bare id/MRN) -> validate
 *    (AST allowlist) -> execute -> render as a markdown table.
 *  - mcp: list this source's allowed tools -> LLM either asks a clarifying
 *    question or picks one tool + args -> call it -> render as a markdown
 *    table. Same output shape either way (a table + a "how we got this"
 *    details block), so the rest of the app (UsecaseRunnerChat,
 *    MarkdownViewer) doesn't need to know which kind of source answered.
 *
 * Recent turns are recorded via ConversationHistoryService (same mechanism
 * db-analytics uses) so a clarifying question's follow-up answer ("just the
 * ones from this month") is interpreted in context rather than as a brand
 * new request.
 *
 * Streams `status` progress chunks throughout (see connector.interface.ts)
 * so the chat UI can show "Reading the data dictionary...",
 * "Generating a query..." etc. while the user waits -- this type doesn't
 * stream answer *tokens* (the LLM call isn't itself streamed), but it does
 * stream progress, and always yields its final answer as one `delta` chunk
 * right before returning.
 */
@Injectable()
export class DbSearchConnector implements UsecaseConnector {
  readonly supportsStreaming = false;

  constructor(
    private readonly schemaIntrospectionService: SchemaIntrospectionService,
    private readonly nlToQueryService: NlToQueryService,
    private readonly queryValidatorService: QueryValidatorService,
    private readonly postgresExecutor: PostgresExecutor,
    private readonly mcpClientService: McpClientService,
    private readonly mcpToolCallService: McpToolCallService,
    private readonly secretsService: SecretsService,
    private readonly conversationHistoryService: ConversationHistoryService,
  ) {}

  run(usecase: UsecaseEntity, input: ConnectorMessageInput): Promise<ConnectorResult> {
    return drainStream(this.runStream(usecase, input));
  }

  async *runStream(usecase: UsecaseEntity, input: ConnectorMessageInput): AsyncGenerator<ConnectorChunk, ConnectorResult> {
    const start = Date.now();
    const config = usecase.config as unknown as DbSearchConfig;
    const source = this.resolveSource(config, input.sourceId);

    const history = await this.conversationHistoryService.getRecent(usecase.id, input.sessionId, HISTORY_TURNS);
    await this.conversationHistoryService.record(usecase.id, input.sessionId, 'user', input.message);
    const historyTurns = history.map((h) => ({ role: h.role, content: h.content }));

    yield { status: `Analyzing your question against "${source.label}"...` };
    const apiKey = await this.secretsService.reveal(config.secretRef);

    let answer: string;
    if (source.type === 'mcp') {
      answer = yield* this.runMcpSource(source, historyTurns, input.message, config, apiKey, usecase.id, input.sessionId);
    } else {
      answer = yield* this.runPostgresSource(source, historyTurns, input.message, config, apiKey, usecase.id, input.sessionId);
    }

    yield { delta: answer };
    return { answer, meta: { model: config.modelName, latencyMs: Date.now() - start } };
  }

  private async *runPostgresSource(
    source: Extract<DataSourceConfig, { type: 'postgres' }>,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    message: string,
    config: DbSearchConfig,
    apiKey: string,
    usecaseId: string,
    sessionId: string,
  ): AsyncGenerator<ConnectorChunk, string> {
    yield { status: `Reading the data dictionary for "${source.label}"...` };
    const schemaDescription = this.schemaIntrospectionService.describe(source.dataDictionary);

    yield { status: 'Identifying the relevant tables and generating a query...' };
    const decision = await this.nlToQueryService.decide(history, message, schemaDescription, {
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiKey,
    });

    if (decision.action === 'clarify') {
      await this.conversationHistoryService.record(usecaseId, sessionId, 'assistant', decision.question);
      return decision.question;
    }

    yield { status: 'Query generated. Validating and running it...' };
    const validated = this.queryValidatorService.validate({ sql: decision.sql }, source.allowedCollectionsOrTables, config.rowLimit);
    const rows = await this.postgresExecutor.execute(source.connectionKey, validated);

    yield { status: 'Formatting results...' };
    const metaBlock = `<details><summary>Generated query</summary>\n\n\`\`\`sql\n${validated.sql}\n\`\`\`\n\n</details>`;
    const answer = this.formatAnswer(rows, metaBlock);
    await this.conversationHistoryService.record(usecaseId, sessionId, 'assistant', answer);
    return answer;
  }

  private async *runMcpSource(
    source: Extract<DataSourceConfig, { type: 'mcp' }>,
    history: Array<{ role: 'user' | 'assistant'; content: string }>,
    message: string,
    config: DbSearchConfig,
    apiKey: string,
    usecaseId: string,
    sessionId: string,
  ): AsyncGenerator<ConnectorChunk, string> {
    if (source.serverKey !== 'cerner_sandbox') {
      throw new NotImplementedException(`MCP server "${source.serverKey}" is not implemented yet`);
    }

    yield { status: `Checking available tools on "${source.label}"...` };
    const allTools = await this.mcpClientService.listTools(source.serverKey);
    const allowedTools = allTools.filter((t) => source.allowedTools.includes(t.name));

    yield { status: 'Deciding how to answer...' };
    const decision = await this.mcpToolCallService.decide(history, message, allowedTools, source.allowedTools, {
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiKey,
    });

    if (decision.action === 'clarify') {
      await this.conversationHistoryService.record(usecaseId, sessionId, 'assistant', decision.question);
      return decision.question;
    }

    yield { status: `Calling ${decision.tool}...` };
    const { rows } = await this.mcpClientService.callTool(source.serverKey, decision.tool, decision.arguments);

    yield { status: 'Formatting results...' };
    const metaBlock = `<details><summary>Tool call</summary>\n\n\`\`\`json\n${JSON.stringify(decision, null, 2)}\n\`\`\`\n\n</details>`;
    const answer = this.formatAnswer(rows, metaBlock);
    await this.conversationHistoryService.record(usecaseId, sessionId, 'assistant', answer);
    return answer;
  }

  private resolveSource(config: DbSearchConfig, sourceId: string | undefined): DataSourceConfig {
    const source = sourceId ? config.sources.find((s) => s.id === sourceId) : config.sources[0];
    if (!source) {
      throw new BadRequestException(
        sourceId ? `Unknown sourceId "${sourceId}" for this usecase` : 'This usecase has no configured sources',
      );
    }
    return source;
  }

  private formatAnswer(rows: Record<string, unknown>[], metaBlock: string): string {
    if (rows.length === 0) {
      return `No results found.\n\n${metaBlock}`;
    }

    const columns = Object.keys(rows[0]);
    const header = `| ${columns.join(' | ')} |`;
    const divider = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${columns.map((c) => this.formatCell(row[c])).join(' | ')} |`).join('\n');

    return `Found ${rows.length} result(s):\n\n${header}\n${divider}\n${body}\n\n${metaBlock}`;
  }

  private formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  }
}
