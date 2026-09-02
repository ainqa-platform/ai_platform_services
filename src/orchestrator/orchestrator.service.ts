import { Injectable } from '@nestjs/common';
import { ChatConnector } from '../connectors/chat/chat.connector';
import { ConnectorChunk, ConnectorMessageInput, ConnectorResult, UsecaseConnector } from '../connectors/connector.interface';
import { DbAnalyticsConnector } from '../connectors/db-analytics/db-analytics.connector';
import { DbSearchConnector } from '../connectors/db-search/db-search.connector';
import { FileQaConnector } from '../connectors/file-qa/file-qa.connector';
import { LangfuseService } from '../observability/langfuse.service';
import { UsecaseType } from '../usecases/entities/usecase.entity';
import { UsecasesService } from '../usecases/usecases.service';

/**
 * The lynchpin: loads a usecase, resolves the connector for its `type`,
 * dispatches, and wraps the call in an observability span. Every other
 * module (usecases, llm-gateway, secrets, connectors, observability) plugs
 * into this one class.
 */
@Injectable()
export class OrchestratorService {
  private readonly connectors: Record<UsecaseType, UsecaseConnector>;

  constructor(
    private readonly usecasesService: UsecasesService,
    private readonly langfuseService: LangfuseService,
    chatConnector: ChatConnector,
    fileQaConnector: FileQaConnector,
    dbSearchConnector: DbSearchConnector,
    dbAnalyticsConnector: DbAnalyticsConnector,
  ) {
    this.connectors = {
      chat: chatConnector,
      file_qa: fileQaConnector,
      db_search: dbSearchConnector,
      db_analytics: dbAnalyticsConnector,
    };
  }

  async dispatch(usecaseId: string, input: ConnectorMessageInput): Promise<ConnectorResult> {
    const usecase = await this.usecasesService.findOne(usecaseId);
    const connector = this.connectors[usecase.type];
    const trace = this.langfuseService.startTrace({
      name: `usecase:${usecase.type}`,
      usecaseId: usecase.id,
      sessionId: input.sessionId,
      userId: input.userId,
    });

    try {
      const result = await connector.run(usecase, input);
      trace?.update({ output: result.answer });
      return result;
    } finally {
      await this.langfuseService.flush();
    }
  }

  async *dispatchStream(usecaseId: string, input: ConnectorMessageInput): AsyncGenerator<ConnectorChunk, ConnectorResult> {
    const usecase = await this.usecasesService.findOne(usecaseId);
    const connector = this.connectors[usecase.type];
    const trace = this.langfuseService.startTrace({
      name: `usecase:${usecase.type}:stream`,
      usecaseId: usecase.id,
      sessionId: input.sessionId,
      userId: input.userId,
    });

    try {
      // Every connector implements runStream (see connector.interface.ts) --
      // db_search/db_analytics emit progress `status` chunks then one final
      // `delta` equal to the whole answer, so the gateway/frontend never
      // need to branch on type.
      const result = yield* connector.runStream(usecase, input);
      trace?.update({ output: result.answer });
      return result;
    } finally {
      await this.langfuseService.flush();
    }
  }
}
