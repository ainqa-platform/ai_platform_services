import { Injectable } from '@nestjs/common';
import { VectorStoreConfig } from '../usecases/dto/usecase-config.schema';
import { ChromaProvider } from './providers/chroma.provider';
import { PgVectorProvider } from './providers/pgvector.provider';
import { VectorStoreProvider } from './vector-store.interface';

/**
 * Resolves a usecase's `config.vectorStore.type` to a provider and derives
 * its collection namespace. Called from file-qa's ingestion/retrieval
 * (once implemented) rather than callers picking a provider directly.
 */
@Injectable()
export class VectorStoreService {
  constructor(
    private readonly chromaProvider: ChromaProvider,
    private readonly pgVectorProvider: PgVectorProvider,
  ) {}

  resolve(config: VectorStoreConfig): VectorStoreProvider {
    switch (config.type) {
      case 'chroma':
        return this.chromaProvider;
      case 'pgvector':
        return this.pgVectorProvider;
    }
  }

  /**
   * A Chroma collection name must be 3-63 chars, alphanumeric/underscore/
   * hyphen, start and end alphanumeric (verified against the live server --
   * see chroma.provider.ts) -- a raw usecase uuid already satisfies this,
   * so it's the default namespace unless a usecase config overrides it.
   */
  collectionFor(usecaseId: string, config: VectorStoreConfig): string {
    if (config.type === 'chroma' && config.collectionName) {
      return config.collectionName;
    }
    return `usecase-${usecaseId}`;
  }
}
