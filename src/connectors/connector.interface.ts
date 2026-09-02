import { UsecaseEntity } from '../usecases/entities/usecase.entity';

export interface ConnectorMessageInput {
  sessionId: string;
  message: string;
  attachments?: Array<{ documentId: string }>;
  userId?: string;
  /**
   * Which of a usecase's config.sources to query (db_search/db_analytics
   * only -- see usecase-config.schema.ts). Chosen by the end user in the
   * chat UI per question, not fixed at usecase-creation time. Ignored by
   * chat/file_qa connectors.
   */
  sourceId?: string;
}

export interface Citation {
  documentId: string;
  chunkId: string;
  score: number;
}

export interface ChartSpec {
  chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'table';
  title: string;
  xAxis?: { key: string; label: string };
  series: Array<{ key: string; label: string; color?: string | null }>;
  data: Array<Record<string, unknown>>;
  meta?: { generatedQuery?: string; rowCount?: number; truncated?: boolean };
}

export interface ConnectorResult {
  answer: string;
  chartSpec?: ChartSpec | null;
  citations?: Citation[];
  meta: { model?: string; latencyMs: number };
}

export interface ConnectorChunk {
  /**
   * A human-readable progress update ("Reading the data dictionary...",
   * "Generating a query...") -- shown to the user while they wait. Never
   * part of the final answer text.
   */
  status?: string;
  /**
   * A slice of the final answer text: token-by-token for chat/file_qa, or
   * the whole answer emitted as a single chunk for db_search/db_analytics
   * (see those connectors' `runStream` -- they always yield one final delta
   * that equals `ConnectorResult.answer` exactly, so the frontend never has
   * to special-case "did this type stream or not").
   */
  delta?: string;
}

/**
 * One contract, four implementations (chat/file-qa/db-search/db-analytics).
 * Every connector streams: `supportsStreaming` is purely descriptive
 * metadata (true = the answer arrives token-by-token; false = as one final
 * delta) -- `runStream` itself is required on all four so every usecase
 * type can emit progress `status` chunks while it works, not just the ones
 * whose answer text streams. `run()` is the non-streaming HTTP fallback
 * (orchestrator.controller.ts) and is implemented via `drainStream` below.
 */
export interface UsecaseConnector {
  readonly supportsStreaming: boolean;
  run(usecase: UsecaseEntity, input: ConnectorMessageInput): Promise<ConnectorResult>;
  runStream(usecase: UsecaseEntity, input: ConnectorMessageInput): AsyncGenerator<ConnectorChunk, ConnectorResult>;
}

/** Drives an AsyncGenerator to completion, discarding yielded chunks, and returns its final value. */
export async function drainStream<T, R>(generator: AsyncGenerator<T, R>): Promise<R> {
  let next = await generator.next();
  while (!next.done) {
    next = await generator.next();
  }
  return next.value;
}
