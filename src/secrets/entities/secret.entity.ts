import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type SecretKind = 'model_api_key' | 'db_credential';

/**
 * Ciphertext-at-rest store (AES-256-GCM, see secrets.service.ts). No route
 * anywhere returns `ciphertext`/`iv`/`authTag` -- decrypted values are only
 * ever read server-side via SecretsService.reveal(), called from
 * llm-gateway/connector executors, never exposed over HTTP.
 *
 * `usecaseId` is a plain FK column, not a `@ManyToOne` relation -- nothing
 * in this codebase loads a Secret's owning Usecase as an object, and
 * declaring both a relation and a same-named `@Column` without an explicit
 * `@JoinColumn` makes TypeORM create a second, ungenerated `usecaseId`
 * column alongside the migrated `usecase_id` one (verified against a real
 * Postgres instance -- INSERT failed with `column "usecaseId" of relation
 * "secret" does not exist`).
 */
@Entity({ name: 'secret', schema: 'ai_platform' })
export class SecretEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'usecase_id', nullable: true })
  usecaseId: string | null;

  @Column({ type: 'text' })
  kind: SecretKind;

  @Column({ type: 'bytea' })
  ciphertext: Buffer;

  @Column({ type: 'bytea' })
  iv: Buffer;

  @Column({ type: 'bytea', name: 'auth_tag' })
  authTag: Buffer;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
