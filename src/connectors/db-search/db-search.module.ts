import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../../llm-gateway/llm-gateway.module';
import { McpModule } from '../../mcp/mcp.module';
import { SecretsModule } from '../../secrets/secrets.module';
import { ConversationModule } from '../../conversation/conversation.module';
import { DbSearchConnector } from './db-search.connector';
import { PostgresExecutor } from './executors/postgres.executor';
import { McpToolCallService } from './mcp-tool-call.service';
import { NlToQueryService } from './nl-to-query.service';
import { QueryValidatorService } from './query-validator.service';
import { SchemaIntrospectionService } from './schema-introspection.service';

@Module({
  imports: [LlmGatewayModule, SecretsModule, McpModule, ConversationModule],
  providers: [
    DbSearchConnector,
    SchemaIntrospectionService,
    NlToQueryService,
    QueryValidatorService,
    PostgresExecutor,
    McpToolCallService,
  ],
  // SchemaIntrospectionService/QueryValidatorService/PostgresExecutor are
  // exported (not just DbSearchConnector) so DbAnalyticsConnectorModule can
  // inject the same instances -- PostgresExecutor owns connection pools per
  // data source, so re-providing it in both modules would open a second,
  // wasteful pool to the same database.
  exports: [DbSearchConnector, SchemaIntrospectionService, QueryValidatorService, PostgresExecutor, McpToolCallService],
})
export class DbSearchConnectorModule {}
