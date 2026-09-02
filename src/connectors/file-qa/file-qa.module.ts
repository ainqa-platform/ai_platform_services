import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LlmGatewayModule } from '../../llm-gateway/llm-gateway.module';
import { SecretsModule } from '../../secrets/secrets.module';
import { UsecasesModule } from '../../usecases/usecases.module';
import { VectorStoreModule } from '../../vector-store/vector-store.module';
import { DocumentChunkEntity } from './entities/document-chunk.entity';
import { DocumentEntity } from './entities/document.entity';
import { FileQaConnector } from './file-qa.connector';
import { FileQaController } from './file-qa.controller';
import { ChunkerService } from './ingestion/chunker.service';
import { EmbeddingService } from './ingestion/embedding.service';
import { IngestionService } from './ingestion/ingestion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentEntity, DocumentChunkEntity]),
    VectorStoreModule,
    LlmGatewayModule,
    SecretsModule,
    UsecasesModule,
  ],
  controllers: [FileQaController],
  providers: [FileQaConnector, IngestionService, ChunkerService, EmbeddingService],
  exports: [FileQaConnector],
})
export class FileQaConnectorModule {}
