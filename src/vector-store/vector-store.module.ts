import { Module } from '@nestjs/common';
import { ChromaProvider } from './providers/chroma.provider';
import { PgVectorProvider } from './providers/pgvector.provider';
import { VectorStoreService } from './vector-store.service';

@Module({
  providers: [VectorStoreService, ChromaProvider, PgVectorProvider],
  exports: [VectorStoreService],
})
export class VectorStoreModule {}
