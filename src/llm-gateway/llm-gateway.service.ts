import { Injectable } from '@nestjs/common';
import {
  LlmChatChunk,
  LlmChatRequest,
  LlmChatResponse,
  LlmEmbedRequest,
  LlmEmbedResponse,
} from './interfaces/llm-provider.interface';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

/**
 * Single entry point every connector calls through -- callers never talk to
 * a provider directly, so a new provider (e.g. a native Anthropic client)
 * only needs to be added here, not in every connector.
 */
@Injectable()
export class LlmGatewayService {
  constructor(private readonly openAiCompatibleProvider: OpenAiCompatibleProvider) {}

  chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    return this.openAiCompatibleProvider.chat(request);
  }

  chatStream(request: LlmChatRequest): AsyncGenerator<LlmChatChunk, LlmChatResponse> {
    return this.openAiCompatibleProvider.chatStream(request);
  }

  embed(request: LlmEmbedRequest): Promise<LlmEmbedResponse> {
    return this.openAiCompatibleProvider.embed(request);
  }
}
