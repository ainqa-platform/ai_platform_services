import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Schema only -- see connectors/file-qa in the approved plan. The ingestion
 * pipeline that populates `document`/`document_chunk` is not implemented in
 * this slice.
 *
 * Deliberately does NOT require the `pgvector` extension: a file_qa usecase
 * can point at Chroma instead of pgvector (see
 * usecases/dto/usecase-config.schema.ts `vectorStore.type`), so pgvector
 * must stay optional infra -- see migration 0004 for the opt-in
 * `embedding` column, only needed by deployments that actually use
 * pgvector.
 */
export class CreateDocumentTables1735700000003 implements MigrationInterface {
  name = 'CreateDocumentTables1735700000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_platform.document (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usecase_id  uuid NOT NULL REFERENCES ai_platform.usecase(id) ON DELETE CASCADE,
        filename    text NOT NULL,
        mime_type   text NOT NULL,
        status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'failed')),
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_document_usecase_id ON ai_platform.document (usecase_id)`);

    await queryRunner.query(`
      CREATE TABLE ai_platform.document_chunk (
        id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id  uuid NOT NULL REFERENCES ai_platform.document(id) ON DELETE CASCADE,
        chunk_index  int NOT NULL,
        content      text NOT NULL,
        token_count  int,
        created_at   timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_document_chunk_document_id ON ai_platform.document_chunk (document_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_platform.document_chunk`);
    await queryRunner.query(`DROP TABLE IF EXISTS ai_platform.document`);
  }
}
