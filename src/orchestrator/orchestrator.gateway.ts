import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { AppConfig } from '../config/configuration';
import { verifyOrDecodeToken } from '../common/guards/jwt.util';
import { OrchestratorService } from './orchestrator.service';

interface IncomingMessage {
  usecaseId: string;
  sessionId: string;
  message: string;
  attachments?: Array<{ documentId: string }>;
  /** Which of a usecase's config.sources to query -- db_search/db_analytics only, see connector.interface.ts. */
  sourceId?: string;
}

/**
 * Streaming transport for chat/file_qa (see connector.interface.ts
 * `supportsStreaming` and the plan's streaming-vs-request/response split).
 * A distinct namespace/path from the existing src/context/socket.js
 * connection used by ChatInterface.jsx for PISTA callbacks -- deliberately
 * NOT shared, since that module's connect/disconnect is a singleton and
 * would collide with an unrelated surface (see the plan for why).
 */
@WebSocketGateway({ namespace: '/usecase-chat', cors: true })
export class OrchestratorGateway {
  private readonly logger = new Logger(OrchestratorGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly orchestratorService: OrchestratorService,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  handleConnection(client: Socket): void {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.emit('usecase:error', { message: 'Missing auth token' });
      client.disconnect(true);
      return;
    }
    try {
      verifyOrDecodeToken(token, this.configService);
    } catch {
      client.emit('usecase:error', { message: 'Invalid auth token' });
      client.disconnect(true);
    }
  }

  @SubscribeMessage('usecase:message')
  async onMessage(@ConnectedSocket() client: Socket, @MessageBody() body: IncomingMessage): Promise<void> {
    try {
      const stream = this.orchestratorService.dispatchStream(body.usecaseId, {
        sessionId: body.sessionId,
        message: body.message,
        attachments: body.attachments,
        sourceId: body.sourceId,
      });

      for (;;) {
        const next = await stream.next();
        if (next.done) {
          client.emit('usecase:done', next.value);
          return;
        }
        if (next.value.status) {
          client.emit('usecase:status', { message: next.value.status });
        }
        if (next.value.delta !== undefined) {
          client.emit('usecase:chunk', { delta: next.value.delta });
        }
      }
    } catch (err) {
      this.logger.error(err instanceof Error ? err.stack : err);
      client.emit('usecase:error', { message: 'Failed to process message' });
    }
  }
}
