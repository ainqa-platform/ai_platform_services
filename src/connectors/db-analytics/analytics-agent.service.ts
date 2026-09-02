import { BadRequestException, Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../llm-gateway/llm-gateway.service';
import { LlmMessage } from '../../llm-gateway/interfaces/llm-provider.interface';
import { McpTool } from '../../mcp/mcp-client.service';

export interface AnalyticsAgentConfig {
  baseUrl: string;
  modelName: string;
  apiKey: string;
  chartTypesAllowed: string[];
}

export interface ClarifyDecision {
  action: 'clarify';
  question: string;
}

export type QuerySpec = { kind: 'sql'; sql: string } | { kind: 'mcp'; tool: string; arguments: Record<string, unknown> };

export interface QueryDecision {
  action: 'query';
  query: QuerySpec;
  chartType: string;
  title: string;
  xAxisKey: string;
  xAxisLabel?: string;
  series: Array<{ key: string; label: string }>;
}

export type AnalyticsDecision = ClarifyDecision | QueryDecision;

export interface HistoryTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * What makes db_analytics "agentic" rather than a one-shot NL2SQL call: on
 * every turn, this decides whether the conversation so far (curated schema/
 * tool list + prior turns from ConversationHistoryService + the new
 * message) has enough information to generate a chart, or whether it
 * should ask a clarifying question instead (e.g. chart type, ambiguous
 * time range or grouping) -- see db-analytics.connector.ts, which records
 * both sides of the exchange so a follow-up answer ("bar chart please") is
 * interpreted against the pending question rather than as a brand new
 * request.
 *
 * Source-type aware: a postgres source gets the SQL-generation prompt (as
 * before); an MCP source gets a tool-selection prompt instead (mirroring
 * db-search/mcp-tool-call.service.ts) -- either way the model must also
 * declare chartType/xAxisKey/series so the connector can shape whatever
 * rows come back into a ChartSpec without a second LLM call.
 */
@Injectable()
export class AnalyticsAgentService {
  constructor(private readonly llmGatewayService: LlmGatewayService) {}

  async decideForSql(
    history: HistoryTurn[],
    message: string,
    schemaDescription: string,
    config: AnalyticsAgentConfig,
  ): Promise<AnalyticsDecision> {
    return this.decide(history, message, config, this.sqlSystemPrompt(schemaDescription, config.chartTypesAllowed));
  }

  async decideForMcp(
    history: HistoryTurn[],
    message: string,
    tools: McpTool[],
    config: AnalyticsAgentConfig,
  ): Promise<AnalyticsDecision> {
    return this.decide(history, message, config, this.mcpSystemPrompt(tools, config.chartTypesAllowed));
  }

  private async decide(
    history: HistoryTurn[],
    message: string,
    config: AnalyticsAgentConfig,
    systemPrompt: string,
  ): Promise<AnalyticsDecision> {
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
      { role: 'user', content: message },
    ];

    const response = await this.llmGatewayService.chat({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 700, // a clarify question, or one query/tool-call plus chart metadata
      messages,
    });

    return this.parseDecision(response.content, config.chartTypesAllowed);
  }

  private clarifyAndChartInstructions(chartTypesAllowed: string[]): string {
    return [
      'Given a conversation and a question about the data below, decide whether you have enough information to ' +
        'produce a chart, or need to ask the user a clarifying question first (e.g. an unspecified time range, ' +
        "ambiguous grouping/metric, or -- only when a sensible default genuinely doesn't apply -- chart type).",
      '',
      "Don't ask about something a reasonable default already covers (e.g. a daily time series defaults to a " +
        'line or bar chart) -- only ask when the request is genuinely ambiguous about what to query or how to ' +
        'show it.',
      '',
      'If you need more information, respond with ONLY this JSON (no prose, no code fence):',
      '{"action": "clarify", "question": "<one clear, specific question>"}',
      '',
      `Otherwise respond with ONLY this JSON, adding "chartType" (one of: ${chartTypesAllowed.join(', ')}), ` +
        '"title" (short chart title), "xAxisKey" (result field to use as the x-axis/category), "xAxisLabel", ' +
        'and "series" (array of {key, label} result fields to plot) to the query fields described below.',
    ].join('\n');
  }

  private sqlSystemPrompt(schemaDescription: string, chartTypesAllowed: string[]): string {
    return [
      'You are a data-analytics agent.',
      '',
      this.clarifyAndChartInstructions(chartTypesAllowed),
      '',
      'Query fields: {"action": "query", "sql": "<single read-only PostgreSQL SELECT using ONLY the documented ' +
        'tables/columns, with column aliases matching xAxisKey/series keys>", ...}',
      '',
      'Rules for the SQL: exactly one SELECT statement, use ONLY the tables/columns below, no INSERT/UPDATE/' +
        'DELETE/DROP/ALTER/CREATE/TRUNCATE, always include a LIMIT, prefer ILIKE over exact match on free-text ' +
        'columns (the schema notes flag which ones). When a category axis represents a person (e.g. grouping or ' +
        'listing by patient), use their name rather than a bare id/MRN as the label wherever a name column is ' +
        'documented and joinable -- a chart or table full of raw ids is not useful to read.',
      '',
      'Schema:',
      schemaDescription,
    ].join('\n');
  }

  private mcpSystemPrompt(tools: McpTool[], chartTypesAllowed: string[]): string {
    const toolList = tools
      .map((t) => `- ${t.name}: ${t.description ?? ''}\n  inputSchema: ${JSON.stringify(t.inputSchema)}`)
      .join('\n');
    return [
      'You are a data-analytics agent that answers by calling exactly one tool.',
      '',
      this.clarifyAndChartInstructions(chartTypesAllowed),
      '',
      'Query fields: {"action": "query", "tool": "<tool name>", "arguments": {...per its inputSchema}, ...}. ' +
        'xAxisKey/series must refer to fields present in that tool\'s result rows.',
      '',
      'Available tools:',
      toolList,
    ].join('\n');
  }

  private parseDecision(content: string, chartTypesAllowed: string[]): AnalyticsDecision {
    const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonText = (fenced ? fenced[1] : content).trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonText);
    } catch (err) {
      throw new BadRequestException(`Agent response was not valid JSON: ${err instanceof Error ? err.message : err}`);
    }

    if (parsed.action === 'clarify') {
      if (typeof parsed.question !== 'string' || !parsed.question.trim()) {
        throw new BadRequestException('Agent clarify response is missing a question');
      }
      return { action: 'clarify', question: parsed.question };
    }

    if (parsed.action === 'query') {
      const chartType = parsed.chartType;
      const xAxisKey = parsed.xAxisKey;
      const series = parsed.series;
      if (typeof chartType !== 'string' || !chartTypesAllowed.includes(chartType)) {
        throw new BadRequestException(
          `Agent chose chartType "${String(chartType)}", which is not in this usecase's chartTypesAllowed`,
        );
      }
      if (typeof xAxisKey !== 'string' || !xAxisKey.trim()) {
        throw new BadRequestException('Agent query response is missing xAxisKey');
      }
      if (!Array.isArray(series) || series.length === 0) {
        throw new BadRequestException('Agent query response is missing series');
      }

      let query: QuerySpec;
      if (typeof parsed.sql === 'string' && parsed.sql.trim()) {
        query = { kind: 'sql', sql: parsed.sql.replace(/;+\s*$/, '') };
      } else if (typeof parsed.tool === 'string' && parsed.tool.trim()) {
        const args = parsed.arguments;
        if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
          throw new BadRequestException('Agent response "arguments" must be an object');
        }
        query = { kind: 'mcp', tool: parsed.tool, arguments: (args as Record<string, unknown>) ?? {} };
      } else {
        throw new BadRequestException('Agent query response is missing "sql" or "tool"');
      }

      return {
        action: 'query',
        query,
        chartType,
        title: typeof parsed.title === 'string' ? parsed.title : 'Chart',
        xAxisKey,
        xAxisLabel: typeof parsed.xAxisLabel === 'string' ? parsed.xAxisLabel : undefined,
        series: series as Array<{ key: string; label: string }>,
      };
    }

    throw new BadRequestException(`Agent response had an unknown "action": ${String(parsed.action)}`);
  }
}
