import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration, { AppConfig } from './config/configuration';
import { DocumentChunkEntity } from './connectors/file-qa/entities/document-chunk.entity';
import { DocumentEntity } from './connectors/file-qa/entities/document.entity';
import { ConversationMessageEntity } from './conversation/entities/conversation-message.entity';
import { HealthController } from './health.controller';
import { ObservabilityModule } from './observability/observability.module';
import { OrchestratorModule } from './orchestrator/orchestrator.module';
import { SecretEntity } from './secrets/entities/secret.entity';
import { SecretsModule } from './secrets/secrets.module';
import { UsecaseEntity } from './usecases/entities/usecase.entity';
import { UsecasesModule } from './usecases/usecases.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      // .env is committed and holds shared configuration; .env.local is
      // gitignored and holds the values that must not reach the repo (e.g.
      // OPENAI_API_KEY, which GitHub push protection rejects). Earlier entries
      // win, so .env.local overrides .env.
      envFilePath: ['.env.local', '.env'],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: configService.get('DATABASE_URL', { infer: true }),
        entities: [UsecaseEntity, SecretEntity, DocumentEntity, DocumentChunkEntity, ConversationMessageEntity],
        // Schema is owned by the migrations in database/migrations, run via
        // `npm run migration:run` -- never auto-sync in this service.
        synchronize: false,
        autoLoadEntities: false,
      }),
    }),
    ObservabilityModule,
    UsecasesModule,
    SecretsModule,
    OrchestratorModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
