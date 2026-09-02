import { Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../llm-gateway/llm-gateway.service';
import { SecretsService } from '../../secrets/secrets.service';
import { UsecaseEntity } from '../../usecases/entities/usecase.entity';
import {
  ConnectorChunk,
  ConnectorMessageInput,
  ConnectorResult,
  UsecaseConnector,
  drainStream,
} from '../connector.interface';

interface ChatUsecaseConfig {
  baseUrl: string;
  modelName: string;
  secretRef: string;
  temperature: number;
  topP: number;
  systemPrompt: string;
}

/**
 * The one fully-implemented connector in this slice -- proves the shared
 * substrate (usecases, secrets, llm-gateway, orchestrator) end-to-end
 * without needing file storage, an embeddings provider, or a read-only DB
 * role to exist yet (see the plan's "Scope of this plan" section).
 */
@Injectable()
export class ChatConnector implements UsecaseConnector {
  readonly supportsStreaming = true;

  constructor(
    private readonly llmGatewayService: LlmGatewayService,
    private readonly secretsService: SecretsService,
  ) {}

  run(usecase: UsecaseEntity, input: ConnectorMessageInput): Promise<ConnectorResult> {
    return drainStream(this.runStream(usecase, input));
  }

  async *runStream(
    usecase: UsecaseEntity,
    input: ConnectorMessageInput,
  ): AsyncGenerator<ConnectorChunk, ConnectorResult> {
    const config = usecase.config as unknown as ChatUsecaseConfig;
    yield { status: 'Thinking...' };
    const apiKey = await this.secretsService.reveal(config.secretRef);

    const stream = this.llmGatewayService.chatStream({
      baseUrl: config.baseUrl,
      apiKey,
      modelName: config.modelName,
      temperature: config.temperature,
      topP: config.topP,
      maxTokens: 1500,
      messages: [
        { role: 'system', content: config.systemPrompt || '' },
        { role: 'user', content: input.message },
      ],
    });

    let final: ConnectorResult | undefined;
    while (true) {
      const next = await stream.next();
      if (next.done) {
        final = {
          answer: next.value.content,
          citations: [],
          meta: { model: next.value.meta.model, latencyMs: next.value.meta.latencyMs },
        };
        break;
      }
      yield { delta: next.value.delta };
    }
    return final;
  }
}
