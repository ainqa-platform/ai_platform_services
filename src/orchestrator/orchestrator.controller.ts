import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConnectorResult } from '../connectors/connector.interface';
import { SendMessageDto } from './dto/send-message.dto';
import { OrchestratorService } from './orchestrator.service';

/**
 * POST /api/usecase/:id/message -- always non-streaming here (the `stream`
 * flag on SendMessageDto only matters to the frontend's transport choice:
 * chat/file_qa clients should prefer the Socket.IO gateway at
 * /usecase-chat for token-by-token output; db_search/db_analytics only
 * ever use this HTTP path, see orchestrator.gateway.ts and the connector
 * interface's `supportsStreaming`).
 */
@Controller('api/usecase/:id/message')
@UseGuards(JwtAuthGuard)
export class OrchestratorController {
  constructor(private readonly orchestratorService: OrchestratorService) {}

  @Post()
  async sendMessage(
    @Param('id', ParseUUIDPipe) usecaseId: string,
    @Body() dto: SendMessageDto,
    @Req() request: { user?: AuthenticatedUser },
  ): Promise<{ usecaseId: string } & ConnectorResult> {
    const result = await this.orchestratorService.dispatch(usecaseId, {
      sessionId: dto.sessionId,
      message: dto.message,
      attachments: dto.attachments,
      sourceId: dto.sourceId,
      userId: request.user?.personId as string | undefined,
    });
    return { usecaseId, ...result };
  }
}
