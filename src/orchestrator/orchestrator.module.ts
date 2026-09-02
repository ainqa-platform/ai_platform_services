import { Module } from '@nestjs/common';
import { ChatConnectorModule } from '../connectors/chat/chat.module';
import { DbAnalyticsConnectorModule } from '../connectors/db-analytics/db-analytics.module';
import { DbSearchConnectorModule } from '../connectors/db-search/db-search.module';
import { FileQaConnectorModule } from '../connectors/file-qa/file-qa.module';
import { ObservabilityModule } from '../observability/observability.module';
import { UsecasesModule } from '../usecases/usecases.module';
import { OrchestratorController } from './orchestrator.controller';
import { OrchestratorGateway } from './orchestrator.gateway';
import { OrchestratorService } from './orchestrator.service';

@Module({
  imports: [
    UsecasesModule,
    ObservabilityModule,
    ChatConnectorModule,
    FileQaConnectorModule,
    DbSearchConnectorModule,
    DbAnalyticsConnectorModule,
  ],
  controllers: [OrchestratorController],
  providers: [OrchestratorService, OrchestratorGateway],
})
export class OrchestratorModule {}
