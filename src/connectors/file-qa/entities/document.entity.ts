import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

/**
 * Schema-only in this slice -- the ingestion pipeline that populates these
 * rows (extract -> chunk -> embed) is not implemented yet, see
 * ingestion.service.ts.
 *
 * `usecaseId` is a plain FK column, not a `@ManyToOne` relation -- see the
 * comment on SecretEntity for why (verified bug: a relation + a same-named
 * `@Column` without `@JoinColumn` makes TypeORM insert into a phantom,
 * unmigrated `usecaseId` column).
 */
@Entity({ name: 'document', schema: 'ai_platform' })
export class DocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'usecase_id' })
  usecaseId: string;

  @Column({ type: 'text' })
  filename: string;

  @Column({ type: 'text', name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'text', default: 'pending' })
  status: DocumentStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
