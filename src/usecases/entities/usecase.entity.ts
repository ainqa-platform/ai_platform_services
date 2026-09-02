import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export type UsecaseType = 'chat' | 'file_qa' | 'db_search' | 'db_analytics';
export type UsecaseStatus = 'active' | 'disabled';

/**
 * Discriminated by `type` -- see usecase-config.dto.ts for the per-type shape
 * validated on write. Only ever holds a `secretRef` (a Secret id), never a
 * raw API key or DB credential.
 */
export type UsecaseConfig = Record<string, unknown>;

@Entity({ name: 'usecase', schema: 'ai_platform' })
export class UsecaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'text' })
  type: UsecaseType;

  @Column({ type: 'text', default: 'active' })
  status: UsecaseStatus;

  @Column({ type: 'jsonb' })
  config: UsecaseConfig;

  @Column({ type: 'text', name: 'created_by', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt: Date;
}
