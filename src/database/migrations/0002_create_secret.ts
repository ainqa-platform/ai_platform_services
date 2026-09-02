import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSecret1735700000002 implements MigrationInterface {
  name = 'CreateSecret1735700000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_platform.secret (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usecase_id  uuid REFERENCES ai_platform.usecase(id) ON DELETE CASCADE,
        kind        text NOT NULL CHECK (kind IN ('model_api_key', 'db_credential')),
        ciphertext  bytea NOT NULL,
        iv          bytea NOT NULL,
        auth_tag    bytea NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_secret_usecase_id ON ai_platform.secret (usecase_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_platform.secret`);
  }
}
