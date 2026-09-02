import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsecase1735700000001 implements MigrationInterface {
  name = 'CreateUsecase1735700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ai_platform`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
    await queryRunner.query(`
      CREATE TABLE ai_platform.usecase (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        text NOT NULL,
        description text,
        type        text NOT NULL CHECK (type IN ('chat', 'file_qa', 'db_search', 'db_analytics')),
        status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        config      jsonb NOT NULL,
        created_by  text,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_usecase_type ON ai_platform.usecase (type)`);
    await queryRunner.query(`CREATE INDEX idx_usecase_status ON ai_platform.usecase (status)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_platform.usecase`);
  }
}
