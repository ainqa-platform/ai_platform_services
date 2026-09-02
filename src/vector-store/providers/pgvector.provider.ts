import { Injectable } from '@nestjs/common';
import { VectorQueryResult, VectorRecord, VectorStoreProvider } from '../vector-store.interface';

/**
 * pgvector-backed alternative to ChromaProvider, operating on
 * ai_platform.document_chunk.embedding (see migration
 * 0004_add_pgvector_embedding_column, which makes the pgvector extension +
 * embedding column opt-in rather than mandatory infra -- a deployment using
 * only Chroma never needs pgvector installed). `collection` maps to a
 * `usecase_id` filter on the shared table rather than a separate namespace
 * per usecase. Not implemented yet -- kept as a real class behind the same
 * VectorStoreProvider interface as ChromaProvider so switching a usecase's
 * `config.vectorStore.type` is a config change, not a rewrite, once this is
 * built.
 */
@Injectable()
export class PgVectorProvider implements VectorStoreProvider {
  async ensureCollection(_collection: string): Promise<void> {
    throw new Error('PgVectorProvider.ensureCollection is not implemented yet');
  }

  async upsert(_collection: string, _records: VectorRecord[]): Promise<void> {
    throw new Error('PgVectorProvider.upsert is not implemented yet');
  }

  async query(_collection: string, _embedding: number[], _topK: number): Promise<VectorQueryResult[]> {
    throw new Error('PgVectorProvider.query is not implemented yet');
  }

  async deleteByDocument(_collection: string, _documentId: string): Promise<void> {
    throw new Error('PgVectorProvider.deleteByDocument is not implemented yet');
  }
}
