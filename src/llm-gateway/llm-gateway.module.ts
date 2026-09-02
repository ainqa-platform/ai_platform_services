import { Module } from '@nestjs/common';
import { LlmGatewayService } from './llm-gateway.service';
import { OpenAiCompatibleProvider } from './providers/openai-compatible.provider';

@Module({
  providers: [LlmGatewayService, OpenAiCompatibleProvider],
  exports: [LlmGatewayService],
})
export class LlmGatewayModule {}
