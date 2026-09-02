import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Effectively opt-in: only matters on deployments that will actually use
 * `vectorStore.type: 'pgvector'` on a file_qa usecase (see
 * usecases/dto/usecase-config.schema.ts and
 * vector-store/providers/pgvector.provider.ts, itself not implemented
 * yet). Deployments using only Chroma (vector-store/providers/
 * chroma.provider.ts) never need the `pgvector` extension installed --
 * rather than failing `npm run migration:run` outright when it's absent
 * (which would force every deployment to install pgvector just to run
 * migrations, defeating the point), this migration attempts
 * `CREATE EXTENSION` and skips the embedding column/index with a logged
 * warning if the extension genuinely isn't installed at the OS/instance
 * level. Re-run migrations after installing pgvector to add the column
 * later.
 */
export class AddPgvectorEmbeddingColumn1735700000004 implements MigrationInterface {
  name = 'AddPgvectorEmbeddingColumn1735700000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    try {
      await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        '[migration 0004] pgvector extension is not installed on this Postgres instance - skipping the ' +
          '`embedding` column. This is fine if this deployment only uses vectorStore.type: "chroma". ' +
          'Install pgvector and re-run migrations to enable vectorStore.type: "pgvector" later.',
      );
      return;
    }
    await queryRunner.query(`ALTER TABLE ai_platform.document_chunk ADD COLUMN embedding vector(1536)`);
    await queryRunner.query(
      `CREATE INDEX idx_document_chunk_embedding ON ai_platform.document_chunk USING hnsw (embedding vector_cosine_ops)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS ai_platform.idx_document_chunk_embedding`);
    await queryRunner.query(`ALTER TABLE ai_platform.document_chunk DROP COLUMN IF EXISTS embedding`);
  }
}
