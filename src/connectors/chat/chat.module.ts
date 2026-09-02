import { Module } from '@nestjs/common';
import { LlmGatewayModule } from '../../llm-gateway/llm-gateway.module';
import { SecretsModule } from '../../secrets/secrets.module';
import { ChatConnector } from './chat.connector';

@Module({
  imports: [LlmGatewayModule, SecretsModule],
  providers: [ChatConnector],
  exports: [ChatConnector],
})
export class ChatConnectorModule {}
