export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmChatRequest {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  messages: LlmMessage[];
  temperature?: number;
  topP?: number;
  /**
   * Caps completion length -- also the safety net against a "thinking"
   * model burning its whole budget on hidden reasoning tokens if
   * `enable_thinking: false` (see openai-compatible.provider.ts) isn't
   * honored by a given model/provider. Defaults to 1024 in the provider.
   */
  maxTokens?: number;
}

export interface LlmChatResponse {
  content: string;
  meta: {
    model: string;
    latencyMs: number;
  };
}

export interface LlmChatChunk {
  delta: string;
}

export interface LlmEmbedRequest {
  baseUrl: string;
  apiKey: string;
  modelName: string;
  input: string[];
}

export interface LlmEmbedResponse {
  embeddings: number[][];
  meta: { model: string; latencyMs: number };
}

/**
 * One interface, swappable providers. `openai-compatible.provider.ts` is
 * the only implementation in this slice (covers OpenAI itself and any
 * OpenAI-API-compatible endpoint, which is what today's
 * chatConfig.apiUrl/modelId.baseurl pattern in ChatInterface.jsx already
 * assumes). Add providers here (e.g. a native Anthropic provider) without
 * touching callers.
 */
export interface LlmProvider {
  chat(request: LlmChatRequest): Promise<LlmChatResponse>;
  chatStream(request: LlmChatRequest): AsyncGenerator<LlmChatChunk, LlmChatResponse>;
  embed(request: LlmEmbedRequest): Promise<LlmEmbedResponse>;
}
