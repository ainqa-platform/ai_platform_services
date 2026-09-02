import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { McpClientService } from '../../mcp/mcp-client.service';
import { SecretsService } from '../../secrets/secrets.service';
import { ConversationHistoryService } from '../../conversation/conversation-history.service';
import { DataSourceConfig } from '../../usecases/dto/usecase-config.schema';
import { UsecaseEntity } from '../../usecases/entities/usecase.entity';
import { ChartSpec, ConnectorChunk, ConnectorMessageInput, ConnectorResult, UsecaseConnector, drainStream } from '../connector.interface';
import { PostgresExecutor } from '../db-search/executors/postgres.executor';
import { QueryValidatorService } from '../db-search/query-validator.service';
import { SchemaIntrospectionService } from '../db-search/schema-introspection.service';
import { AnalyticsAgentService, AnalyticsDecision, QueryDecision } from './analytics-agent.service';

interface DbAnalyticsConfig {
  baseUrl: string;
  modelName: string;
  secretRef: string;
  sources: DataSourceConfig[];
  rowLimit: number;
  chartTypesAllowed: string[];
}

const HISTORY_TURNS = 10;

/**
 * Agentic loop (see analytics-agent.service.ts), source-aware the same way
 * DbSearchConnector is (input.sourceId picks which of config.sources to
 * query): record the incoming message -> load recent turns for this
 * session -> ask the agent (SQL-generation prompt for a postgres source,
 * tool-selection prompt for an MCP source) to either request clarification
 * or commit to a query/tool-call+chart plan -> on "clarify", record and
 * return the question (no query run, no chart -- the user's next message
 * in the same session is then interpreted with this exchange in context)
 * -> on "query", validate/execute/call, then shape the rows into a
 * ChartSpec using the agent's declared xAxisKey/series.
 *
 * Streams `status` progress chunks throughout (see connector.interface.ts)
 * and always yields its final answer text as one `delta` chunk right
 * before returning, same invariant as DbSearchConnector.
 */
@Injectable()
export class DbAnalyticsConnector implements UsecaseConnector {
  readonly supportsStreaming = false;

  constructor(
    private readonly schemaIntrospectionService: SchemaIntrospectionService,
    private readonly analyticsAgentService: AnalyticsAgentService,
    private readonly queryValidatorService: QueryValidatorService,
    private readonly postgresExecutor: PostgresExecutor,
    private readonly mcpClientService: McpClientService,
    private readonly secretsService: SecretsService,
    private readonly conversationHistoryService: ConversationHistoryService,
  ) {}

  run(usecase: UsecaseEntity, input: ConnectorMessageInput): Promise<ConnectorResult> {
    return drainStream(this.runStream(usecase, input));
  }

  async *runStream(usecase: UsecaseEntity, input: ConnectorMessageInput): AsyncGenerator<ConnectorChunk, ConnectorResult> {
    const start = Date.now();
    const config = usecase.config as unknown as DbAnalyticsConfig;
    const source = this.resolveSource(config, input.sourceId);

    yield { status: `Reviewing our conversation about "${source.label}"...` };
    const history = await this.conversationHistoryService.getRecent(usecase.id, input.sessionId, HISTORY_TURNS);
    await this.conversationHistoryService.record(usecase.id, input.sessionId, 'user', input.message);

    const apiKey = await this.secretsService.reveal(config.secretRef);
    const historyTurns = history.map((h) => ({ role: h.role, content: h.content }));
    const agentConfig = {
      baseUrl: config.baseUrl,
      modelName: config.modelName,
      apiKey,
      chartTypesAllowed: config.chartTypesAllowed,
    };

    let decision: AnalyticsDecision;
    if (source.type === 'postgres') {
      yield { status: `Reading the data dictionary for "${source.label}"...` };
      const schemaDescription = this.schemaIntrospectionService.describe(source.dataDictionary);
      yield { status: 'Deciding whether to run a query or ask a clarifying question...' };
      decision = await this.analyticsAgentService.decideForSql(historyTurns, input.message, schemaDescription, agentConfig);
    } else {
      if (source.serverKey !== 'cerner_sandbox') {
        throw new NotImplementedException(`MCP server "${source.serverKey}" is not implemented yet`);
      }
      yield { status: `Checking available tools on "${source.label}"...` };
      const allTools = await this.mcpClientService.listTools(source.serverKey);
      const allowedTools = allTools.filter((t) => source.allowedTools.includes(t.name));
      yield { status: 'Deciding whether to run a query or ask a clarifying question...' };
      decision = await this.analyticsAgentService.decideForMcp(historyTurns, input.message, allowedTools, agentConfig);
    }

    if (decision.action === 'clarify') {
      await this.conversationHistoryService.record(usecase.id, input.sessionId, 'assistant', decision.question);
      yield { delta: decision.question };
      return { answer: decision.question, meta: { model: config.modelName, latencyMs: Date.now() - start } };
    }

    yield { status: 'Query decided. Validating and running it...' };
    const { rows, metaBlock } = await this.executeDecision(source, decision, config);

    yield { status: 'Building your chart...' };
    const chartSpec: ChartSpec | null =
      rows.length > 0
        ? {
            chartType: decision.chartType as ChartSpec['chartType'],
            title: decision.title,
            xAxis: { key: decision.xAxisKey, label: decision.xAxisLabel ?? decision.xAxisKey },
            series: decision.series,
            data: rows,
            meta: { rowCount: rows.length },
          }
        : null;

    const answer =
      rows.length > 0 ? `${decision.title} (${rows.length} data point(s)).` : `No data found for "${decision.title}".`;

    await this.conversationHistoryService.record(usecase.id, input.sessionId, 'assistant', answer);
    const fullAnswer = `${answer}\n\n${metaBlock}`;
    yield { delta: fullAnswer };

    return {
      answer: fullAnswer,
      chartSpec,
      meta: { model: config.modelName, latencyMs: Date.now() - start },
    };
  }

  private async executeDecision(
    source: DataSourceConfig,
    decision: QueryDecision,
    config: DbAnalyticsConfig,
  ): Promise<{ rows: Record<string, unknown>[]; metaBlock: string }> {
    if (decision.query.kind === 'sql') {
      if (source.type !== 'postgres') {
        throw new BadRequestException('Agent produced SQL for a non-postgres source');
      }
      const validated = this.queryValidatorService.validate(
        { sql: decision.query.sql },
        source.allowedCollectionsOrTables,
        config.rowLimit,
      );
      const rows = await this.postgresExecutor.execute(source.connectionKey, validated);
      return { rows, metaBlock: `<details><summary>Generated query</summary>\n\n\`\`\`sql\n${validated.sql}\n\`\`\`\n\n</details>` };
    }

    if (source.type !== 'mcp') {
      throw new BadRequestException('Agent produced a tool call for a non-mcp source');
    }
    if (!source.allowedTools.includes(decision.query.tool)) {
      throw new BadRequestException(`Agent chose tool "${decision.query.tool}", which is not in this source's allowedTools`);
    }
    const { rows } = await this.mcpClientService.callTool(source.serverKey, decision.query.tool, decision.query.arguments);
    return { rows, metaBlock: `<details><summary>Tool call</summary>\n\n\`\`\`json\n${JSON.stringify(decision.query, null, 2)}\n\`\`\`\n\n</details>` };
  }

  private resolveSource(config: DbAnalyticsConfig, sourceId: string | undefined): DataSourceConfig {
    const source = sourceId ? config.sources.find((s) => s.id === sourceId) : config.sources[0];
    if (!source) {
      throw new BadRequestException(
        sourceId ? `Unknown sourceId "${sourceId}" for this usecase` : 'This usecase has no configured sources',
      );
    }
    return source;
  }
}
