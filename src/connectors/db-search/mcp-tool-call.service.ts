import { BadRequestException, Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../llm-gateway/llm-gateway.service';
import { LlmMessage } from '../../llm-gateway/interfaces/llm-provider.interface';
import { McpTool } from '../../mcp/mcp-client.service';
import { HistoryTurn } from './nl-to-query.service';

export type McpDecision =
  | { action: 'clarify'; question: string }
  | { action: 'query'; tool: string; arguments: Record<string, unknown> };

export interface McpToolCallConfig {
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

/**
 * The MCP-source counterpart to nl-to-query.service.ts: instead of
 * generating SQL, the LLM picks ONE tool + JSON arguments from the MCP
 * source's live tool list (McpClientService.listTools, pre-filtered to the
 * source's `allowedTools` -- the model is never even shown a disallowed
 * tool, same principle as the SQL schema allowlist), or asks a clarifying
 * question first when a required argument (e.g. which patient) genuinely
 * can't be inferred from the question or recent conversation. The chosen
 * tool name is checked against `allowedTools` again after the LLM responds,
 * as defense in depth against a hallucinated tool name.
 */
@Injectable()
export class McpToolCallService {
  constructor(private readonly llmGatewayService: LlmGatewayService) {}

  async decide(
    history: HistoryTurn[],
    question: string,
    tools: McpTool[],
    allowedTools: string[],
    config: McpToolCallConfig,
  ): Promise<McpDecision> {
    const messages: LlmMessage[] = [
      { role: 'system', content: this.systemPrompt(tools) },
      ...history.map((h) => ({ role: h.role, content: h.content }) as LlmMessage),
      { role: 'user', content: question },
    ];

    const response = await this.llmGatewayService.chat({
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      temperature: 0,
      maxTokens: 400, // a clarify question or one tool name + small args object
      messages,
    });

    const decision = this.parseDecision(response.content);
    if (decision.action === 'query' && !allowedTools.includes(decision.tool)) {
      throw new BadRequestException(`Agent chose tool "${decision.tool}", which is not in this source's allowedTools`);
    }
    return decision;
  }

  private systemPrompt(tools: McpTool[]): string {
    const toolList = tools
      .map((t) => `- ${t.name}: ${t.description ?? ''}\n  inputSchema: ${JSON.stringify(t.inputSchema)}`)
      .join('\n');
    return [
      'You answer a question by calling exactly one of the tools below, or by asking one clarifying question ' +
        "first when a required argument (e.g. which patient) genuinely can't be inferred from the question or " +
        "recent conversation -- don't invent patient/record ids that were never mentioned.",
      '',
      'Respond with ONLY one of these two JSON shapes (no prose, no code fence):',
      '{"action": "clarify", "question": "<one clear, specific question>"}',
      '{"action": "query", "tool": "<tool name>", "arguments": {...per its inputSchema}}',
      '',
      'Available tools:',
      toolList,
    ].join('\n');
  }

  private parseDecision(content: string): McpDecision {
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

    if (typeof parsed.tool !== 'string' || !parsed.tool.trim()) {
      throw new BadRequestException('Agent response is missing "tool"');
    }
    const args = parsed.arguments;
    if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
      throw new BadRequestException('Agent response "arguments" must be an object');
    }

    return { action: 'query', tool: parsed.tool, arguments: (args as Record<string, unknown>) ?? {} };
  }
}
