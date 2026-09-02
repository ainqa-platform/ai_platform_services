import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { UsecaseEntity } from '../usecases/entities/usecase.entity';
import { SecretEntity } from '../secrets/entities/secret.entity';
import { DocumentEntity } from '../connectors/file-qa/entities/document.entity';
import { DocumentChunkEntity } from '../connectors/file-qa/entities/document-chunk.entity';
import { ConversationMessageEntity } from '../conversation/entities/conversation-message.entity';

dotenv.config();

/**
 * Used both by the running app (via TypeOrmModule.forRootAsync in
 * app.module.ts) and by the TypeORM CLI for migrations (`npm run
 * migration:run`, see package.json). Kept as a plain DataSource (not
 * wrapped in Nest DI) because the CLI needs to import this file directly.
 *
 * A single default export -- `typeorm-ts-node-commonjs`'s CLI loader
 * requires the module to contain exactly one DataSource export; a second
 * named export alongside `default` makes it see two and fail with "Given
 * data source file must contain only one export of DataSource instance".
 */
export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [UsecaseEntity, SecretEntity, DocumentEntity, DocumentChunkEntity, ConversationMessageEntity],
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === 'true',
});
