import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateConversationMessage1735700000005 implements MigrationInterface {
  name = 'CreateConversationMessage1735700000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE ai_platform.conversation_message (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        usecase_id  uuid NOT NULL REFERENCES ai_platform.usecase(id) ON DELETE CASCADE,
        session_id  uuid NOT NULL,
        role        text NOT NULL CHECK (role IN ('user', 'assistant')),
        content     text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_conversation_message_session ON ai_platform.conversation_message (usecase_id, session_id, created_at)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS ai_platform.conversation_message`);
  }
}
