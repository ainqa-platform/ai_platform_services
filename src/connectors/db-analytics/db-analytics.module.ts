import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../../llm-gateway/llm-gateway.module';
import { McpModule } from '../../mcp/mcp.module';
import { SecretsModule } from '../../secrets/secrets.module';
import { ConversationModule } from '../../conversation/conversation.module';
import { DbSearchConnectorModule } from '../db-search/db-search.module';
import { AnalyticsAgentService } from './analytics-agent.service';
import { DbAnalyticsConnector } from './db-analytics.connector';

@Module({
  imports: [DbSearchConnectorModule, LlmGatewayModule, SecretsModule, ConversationModule, McpModule],
  providers: [DbAnalyticsConnector, AnalyticsAgentService],
  exports: [DbAnalyticsConnector],
})
export class DbAnalyticsConnectorModule {}
