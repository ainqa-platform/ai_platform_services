import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Langfuse } from 'langfuse';
import { AppConfig } from '../config/configuration';

/**
 * Server-side Langfuse client. Unlike src/langfuse/* in the frontend (which
 * ships the secret key inside the CRA bundle -- see
 * docs/APPLICATION_OVERVIEW.md section 11), the secret key here never
 * leaves the server process.
 */
@Injectable()
export class LangfuseService implements OnModuleDestroy {
  private readonly logger = new Logger(LangfuseService.name);
  private readonly client: Langfuse | null;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const secretKey = this.configService.get('LANGFUSE_SECRET_KEY', { infer: true });
    const publicKey = this.configService.get('LANGFUSE_PUBLIC_KEY', { infer: true });
    const baseUrl = this.configService.get('LANGFUSE_BASE_URL', { infer: true });

    if (!secretKey || !publicKey || !baseUrl) {
      this.logger.warn('Langfuse credentials not configured - orchestrator spans will not be recorded.');
      this.client = null;
      return;
    }
    this.client = new Langfuse({ secretKey, publicKey, baseUrl });
  }

  startTrace(params: { name: string; usecaseId: string; sessionId: string; userId?: string }) {
    return this.client?.trace({
      name: params.name,
      sessionId: params.sessionId,
      userId: params.userId,
      metadata: { usecaseId: params.usecaseId },
    });
  }

  async flush(): Promise<void> {
    await this.client?.flushAsync();
  }

  async onModuleDestroy(): Promise<void> {
    await this.flush();
  }
}
