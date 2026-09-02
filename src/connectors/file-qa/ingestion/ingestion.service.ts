import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { UsecaseEntity } from '../../../usecases/entities/usecase.entity';
import { VectorRecord } from '../../../vector-store/vector-store.interface';
import { VectorStoreService } from '../../../vector-store/vector-store.service';
import { DocumentChunkEntity } from '../entities/document-chunk.entity';
import { DocumentEntity } from '../entities/document.entity';
import { ChunkerService } from './chunker.service';
import { EmbeddingService } from './embedding.service';
import { extractCsvText } from './extractors/csv.extractor';
import { extractDocxText } from './extractors/docx.extractor';
import { extractImageText } from './extractors/image-ocr.extractor';
import { extractPdfText } from './extractors/pdf.extractor';

interface FileQaConfig {
  baseUrl: string;
  modelName: string;
  embeddingModel: string;
  secretRef: string;
  chunkSize: number;
  chunkOverlap: number;
  vectorStore: { type: 'chroma' | 'pgvector'; collectionName?: string };
}

interface UploadedFileInput {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

/**
 * Pipeline: upload -> create `document` row (status: pending) -> extract
 * text (per-mime extractor) -> chunk (ChunkerService) -> embed each chunk
 * (EmbeddingService) -> upsert into the usecase's configured vector store
 * (pgvector or Chroma, via VectorStoreService) -> `document.status =
 * ready`. Called from FileQaController.uploadDocument.
 */
@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    @InjectRepository(DocumentEntity) private readonly documentRepository: Repository<DocumentEntity>,
    @InjectRepository(DocumentChunkEntity) private readonly chunkRepository: Repository<DocumentChunkEntity>,
    private readonly chunkerService: ChunkerService,
    private readonly embeddingService: EmbeddingService,
    private readonly vectorStoreService: VectorStoreService,
  ) {}

  async ingest(usecase: UsecaseEntity, file: UploadedFileInput): Promise<DocumentEntity> {
    const config = usecase.config as unknown as FileQaConfig;

    const document = await this.documentRepository.save(
      this.documentRepository.create({
        usecaseId: usecase.id,
        filename: file.filename,
        mimeType: file.mimeType,
        status: 'pending',
      }),
    );

    // Fire-and-forget: the HTTP layer (FileQaController) returns the
    // `pending` document immediately rather than blocking on
    // extraction/OCR/embedding, which can take a while. This is in-process
    // only (not a durable job queue) -- a restart mid-ingestion leaves the
    // document stuck in 'processing', acceptable for this slice but worth
    // revisiting (e.g. BullMQ) before real production document volume.
    this.processDocument(document, usecase, config, file).catch((err) => {
      this.logger.error(`Ingestion failed for document ${document.id}: ${err instanceof Error ? err.message : err}`);
    });

    return document;
  }

  private async processDocument(
    document: DocumentEntity,
    usecase: UsecaseEntity,
    config: FileQaConfig,
    file: UploadedFileInput,
  ): Promise<void> {
    try {
      await this.documentRepository.update(document.id, { status: 'processing' });

      const text = await this.extractText(file.mimeType, file.buffer);
      const chunks = this.chunkerService.chunk(text, config.chunkSize, config.chunkOverlap);
      if (chunks.length === 0) {
        throw new Error('No extractable text found in document');
      }

      const embeddings = await this.embeddingService.embed(
        { baseUrl: config.baseUrl, modelName: config.embeddingModel, secretRef: config.secretRef },
        chunks.map((c) => c.content),
      );

      // Ids are generated here (not left to the DB default) so the same id
      // can be used as the vector store's point id, per the "document_chunk
      // id doubles as vector id" contract in vector-store.interface.ts --
      // no separate id-mapping table needed.
      const chunkEntities = chunks.map((chunk) =>
        this.chunkRepository.create({
          id: randomUUID(),
          documentId: document.id,
          chunkIndex: chunk.index,
          content: chunk.content,
          tokenCount: chunk.content.split(/\s+/).filter(Boolean).length,
        }),
      );
      await this.chunkRepository.save(chunkEntities);

      const vectorStore = this.vectorStoreService.resolve(config.vectorStore);
      const collection = this.vectorStoreService.collectionFor(usecase.id, config.vectorStore);
      await vectorStore.ensureCollection(collection);

      const records: VectorRecord[] = chunkEntities.map((entity, i) => ({
        id: entity.id,
        embedding: embeddings[i],
        content: entity.content,
        metadata: { documentId: document.id, chunkIndex: entity.chunkIndex, filename: file.filename },
      }));
      await vectorStore.upsert(collection, records);

      await this.documentRepository.update(document.id, { status: 'ready' });
    } catch (err) {
      await this.documentRepository.update(document.id, { status: 'failed' });
      throw err;
    }
  }

  private async extractText(mimeType: string, buffer: Buffer): Promise<string> {
    if (mimeType === 'application/pdf') {
      return extractPdfText(buffer);
    }
    if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return extractDocxText(buffer);
    }
    if (mimeType === 'text/csv') {
      return extractCsvText(buffer);
    }
    if (mimeType.startsWith('image/')) {
      return extractImageText(buffer);
    }
    if (mimeType.startsWith('text/')) {
      return buffer.toString('utf8');
    }
    throw new Error(`Unsupported file type: ${mimeType}`);
  }
}
