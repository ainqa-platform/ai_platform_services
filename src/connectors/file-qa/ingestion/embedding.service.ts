import { Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../../llm-gateway/llm-gateway.service';
import { SecretsService } from '../../../secrets/secrets.service';

export interface EmbeddingConfig {
  baseUrl: string;
  modelName: string;
  secretRef: string;
}

/**
 * Calls the usecase's configured embedding model (via llm-gateway's
 * embed()) to turn chunk text into vectors. Same OpenAI-compatible
 * `/embeddings` endpoint shape as the chat completions call -- see
 * llm-gateway/providers/openai-compatible.provider.ts. Batches all chunks
 * from one document into a single request rather than one call per chunk.
 */
@Injectable()
export class EmbeddingService {
  constructor(
    private readonly llmGatewayService: LlmGatewayService,
    private readonly secretsService: SecretsService,
  ) {}

  async embed(config: EmbeddingConfig, texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const apiKey = await this.secretsService.reveal(config.secretRef);
    const response = await this.llmGatewayService.embed({
      baseUrl: config.baseUrl,
      apiKey,
      modelName: config.modelName,
      input: texts,
    });
    return response.embeddings;
  }
}
