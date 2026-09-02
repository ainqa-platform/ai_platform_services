import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import {
  LlmChatChunk,
  LlmChatRequest,
  LlmChatResponse,
  LlmEmbedRequest,
  LlmEmbedResponse,
  LlmProvider,
} from '../interfaces/llm-provider.interface';

interface OpenAiCompletionResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string }; delta?: { content?: string } }>;
}

interface OpenAiEmbeddingResponse {
  model?: string;
  data?: Array<{ embedding: number[]; index: number }>;
}

/**
 * Talks to any OpenAI-chat-completions-compatible endpoint (covers OpenAI
 * itself, and self-hosted/gateway endpoints exposing the same shape --
 * matches the request/response pattern already in use client-side today,
 * see ChatInterface.jsx's `callChatAPI`). This is the only place a model
 * API key is used; it's revealed just-in-time by SecretsService and never
 * logged.
 */
@Injectable()
export class OpenAiCompatibleProvider implements LlmProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);

  async chat(request: LlmChatRequest): Promise<LlmChatResponse> {
    const start = Date.now();
    const response = await fetch(this.completionsUrl(request.baseUrl), {
      method: 'POST',
      headers: this.headers(request.apiKey),
      body: JSON.stringify(this.body(request, false)),
    });

    if (!response.ok) {
      await this.throwUpstreamError(response);
    }

    const json = (await response.json()) as OpenAiCompletionResponse;
    const content = json.choices?.[0]?.message?.content ?? '';
    return {
      content,
      meta: { model: json.model ?? request.modelName, latencyMs: Date.now() - start },
    };
  }

  async *chatStream(request: LlmChatRequest): AsyncGenerator<LlmChatChunk, LlmChatResponse> {
    const start = Date.now();
    const response = await fetch(this.completionsUrl(request.baseUrl), {
      method: 'POST',
      headers: this.headers(request.apiKey),
      body: JSON.stringify(this.body(request, true)),
    });

    if (!response.ok) {
      await this.throwUpstreamError(response);
    }
    if (!response.body) {
      throw new BadGatewayException('LLM provider returned no readable response stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice('data:'.length).trim();
        if (payload === '[DONE]') continue;
        try {
          const parsed = JSON.parse(payload) as OpenAiCompletionResponse;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            full += delta;
            yield { delta };
          }
        } catch (err) {
          this.logger.warn(`Could not parse SSE chunk: ${payload.slice(0, 200)}`);
        }
      }
    }

    return { content: full, meta: { model: request.modelName, latencyMs: Date.now() - start } };
  }

  async embed(request: LlmEmbedRequest): Promise<LlmEmbedResponse> {
    const start = Date.now();
    const response = await fetch(this.embeddingsUrl(request.baseUrl), {
      method: 'POST',
      headers: this.headers(request.apiKey),
      body: JSON.stringify({ model: request.modelName, input: request.input }),
    });

    if (!response.ok) {
      await this.throwUpstreamError(response);
    }

    const json = (await response.json()) as OpenAiEmbeddingResponse;
    const embeddings = (json.data ?? [])
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding);

    return {
      embeddings,
      meta: { model: json.model ?? request.modelName, latencyMs: Date.now() - start },
    };
  }

  /**
   * Surfaces the upstream provider's actual error (e.g. DeepInfra's "You
   * need positive balance to do inference") as a proper HTTP exception --
   * verified necessary against real usage: without this, an upstream 402/
   * 401/429 was swallowed into a generic `Error`, which the app's global
   * HttpExceptionFilter then turned into an opaque 500 with no indication
   * of what actually went wrong. BadGatewayException (502) reflects that
   * the failure is this server's upstream, not this server itself.
   */
  private async throwUpstreamError(response: Response): Promise<never> {
    const text = await response.text().catch(() => '');
    let upstreamMessage = text;
    try {
      const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
      upstreamMessage =
        (typeof parsed.error === 'object' ? parsed.error?.message : parsed.error) ?? parsed.message ?? text;
    } catch {
      // not JSON -- fall back to the raw text set above
    }
    this.logger.error(`LLM provider request failed (${response.status}): ${text}`);
    throw new BadGatewayException(`LLM provider error (${response.status}): ${upstreamMessage || 'unknown error'}`);
  }

  /**
   * Normalizes to the provider's API root regardless of which form
   * `baseUrl` was entered in -- verified necessary against real data: the
   * legacy `usecasedefination`/`LLMModels` tables in this same Postgres
   * instance store DeepInfra's baseUrl WITH `/chat/completions` already
   * appended (`https://api.deepinfra.com/v1/openai/chat/completions`).
   * Naively appending `/embeddings` onto that would produce
   * `.../chat/completions/embeddings`, which doesn't exist.
   */
  private rootUrl(baseUrl: string): string {
    return baseUrl.replace(/\/+$/, '').replace(/\/(chat\/completions|embeddings)$/, '');
  }

  private completionsUrl(baseUrl: string): string {
    return `${this.rootUrl(baseUrl)}/chat/completions`;
  }

  private embeddingsUrl(baseUrl: string): string {
    return `${this.rootUrl(baseUrl)}/embeddings`;
  }

  private headers(apiKey: string): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  /**
   * `chat_template_kwargs.enable_thinking: false` turns off extended
   * "thinking" mode on Qwen3-style hybrid-reasoning models (the vLLM/SGLang
   * convention DeepInfra and similar OpenAI-compatible hosts pass through)
   * -- verified necessary against real usage: without it, a model like
   * "Qwen/Qwen3.6-35B-A3B" burns 1000+ hidden `reasoning_content` tokens on
   * every call before answering, turning an 8-15s reply into 60-90+s. None
   * of our connectors read `reasoning_content` (only `message.content`), so
   * that reasoning time is pure wasted latency here. A plain OpenAI-style
   * endpoint that doesn't recognize this field ignores the extra key rather
   * than erroring, so it's safe to send unconditionally. `max_tokens` is a
   * second, independent safety net in case a model ignores the flag above.
   */
  private body(request: LlmChatRequest, stream: boolean) {
    return {
      model: request.modelName,
      messages: request.messages,
      temperature: request.temperature ?? 0.1,
      top_p: request.topP ?? 1,
      max_tokens: request.maxTokens ?? 1024,
      chat_template_kwargs: { enable_thinking: false },
      stream,
    };
  }
}
