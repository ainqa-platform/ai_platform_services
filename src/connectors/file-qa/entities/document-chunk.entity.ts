import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Schema-only in this slice. This table holds chunk text/metadata
 * regardless of which vector store backend a usecase picks (see
 * usecases/dto/usecase-config.schema.ts `vectorStore.type` and
 * vector-store/) -- the actual embedding vectors live either in Chroma
 * (ChromaProvider, keyed by this row's `id`) or, only when a deployment
 * opts into pgvector (migration 0004_add_pgvector_embedding_column, NOT
 * run by default -- see that migration), in an `embedding vector(1536)`
 * column on this same table. That column is deliberately NOT mapped here
 * even when present: TypeORM's Postgres driver has no native pgvector
 * column type, and pgvector's `<=>` operator isn't expressible through the
 * QueryBuilder -- PgVectorProvider (once implemented) accesses it via raw
 * queries instead of a mismatched ORM column type.
 *
 * `documentId` is a plain FK column, not a `@ManyToOne` relation -- see the
 * comment on SecretEntity for why (verified bug: a relation + a same-named
 * `@Column` without `@JoinColumn` makes TypeORM insert into a phantom,
 * unmigrated column).
 */
@Entity({ name: 'document_chunk', schema: 'ai_platform' })
export class DocumentChunkEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'document_id' })
  documentId: string;

  @Column({ type: 'int', name: 'chunk_index' })
  chunkIndex: number;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'int', name: 'token_count', nullable: true })
  tokenCount: number | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
