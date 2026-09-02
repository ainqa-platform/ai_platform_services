import { Injectable } from '@nestjs/common';
import { LlmGatewayService } from '../../llm-gateway/llm-gateway.service';
import { SecretsService } from '../../secrets/secrets.service';
import { UsecaseEntity } from '../../usecases/entities/usecase.entity';
import { VectorStoreService } from '../../vector-store/vector-store.service';
import {
  Citation,
  ConnectorChunk,
  ConnectorMessageInput,
  ConnectorResult,
  UsecaseConnector,
  drainStream,
} from '../connector.interface';

interface FileQaConfig {
  baseUrl: string;
  modelName: string;
  embeddingModel: string;
  secretRef: string;
  topK: number;
  vectorStore: { type: 'chroma' | 'pgvector'; collectionName?: string };
}

/**
 * Retrieval-augmented chat: embed the query, kNN-search this usecase's
 * vector store collection (VectorStoreService), inject the top-K chunks as
 * context, call llm-gateway. Mirrors ChatConnector's structure but adds a
 * retrieval step before the LLM call and returns citations.
 */
@Injectable()
export class FileQaConnector implements UsecaseConnector {
  readonly supportsStreaming = true;

  constructor(
    private readonly llmGatewayService: LlmGatewayService,
    private readonly secretsService: SecretsService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  run(usecase: UsecaseEntity, input: ConnectorMessageInput): Promise<ConnectorResult> {
    return drainStream(this.runStream(usecase, input));
  }

  async *runStream(
    usecase: UsecaseEntity,
    input: ConnectorMessageInput,
  ): AsyncGenerator<ConnectorChunk, ConnectorResult> {
    yield { status: 'Searching your documents...' };
    const { apiKey, contextText, citations, config } = await this.retrieve(usecase, input);
    yield {
      status:
        citations.length > 0
          ? `Found ${citations.length} relevant passage${citations.length === 1 ? '' : 's'}. Generating an answer...`
          : 'No matching passages found. Generating an answer...',
    };

    const stream = this.llmGatewayService.chatStream({
      baseUrl: config.baseUrl,
      apiKey,
      modelName: config.modelName,
      maxTokens: 1500,
      messages: [
        { role: 'system', content: this.systemPrompt(contextText) },
        { role: 'user', content: input.message },
      ],
    });

    let final: ConnectorResult | undefined;
    for (;;) {
      const next = await stream.next();
      if (next.done) {
        final = {
          answer: next.value.content,
          citations,
          meta: { model: next.value.meta.model, latencyMs: next.value.meta.latencyMs },
        };
        break;
      }
      yield { delta: next.value.delta };
    }
    return final;
  }

  private async retrieve(
    usecase: UsecaseEntity,
    input: ConnectorMessageInput,
  ): Promise<{ apiKey: string; contextText: string; citations: Citation[]; config: FileQaConfig }> {
    const config = usecase.config as unknown as FileQaConfig;
    const apiKey = await this.secretsService.reveal(config.secretRef);

    const embedResponse = await this.llmGatewayService.embed({
      baseUrl: config.baseUrl,
      apiKey,
      modelName: config.embeddingModel,
      input: [input.message],
    });

    const vectorStore = this.vectorStoreService.resolve(config.vectorStore);
    const collection = this.vectorStoreService.collectionFor(usecase.id, config.vectorStore);
    await vectorStore.ensureCollection(collection);
    const results = await vectorStore.query(collection, embedResponse.embeddings[0], config.topK || 5);

    const contextText = results.map((r, i) => `[${i + 1}] ${r.content}`).join('\n\n');
    const citations: Citation[] = results.map((r) => ({
      documentId: (r.metadata.documentId as string) ?? '',
      chunkId: r.id,
      score: r.score,
    }));

    return { apiKey, contextText, citations, config };
  }

  private systemPrompt(contextText: string): string {
    if (!contextText.trim()) {
      return 'No relevant documents were found for this question. Say so plainly rather than guessing.';
    }
    return (
      "Answer the user's question using ONLY the numbered context excerpts below. " +
      "If the context doesn't contain the answer, say you don't know rather than guessing. " +
      `Cite excerpt numbers like [1] where relevant.\n\nContext:\n${contextText}`
    );
  }
}
