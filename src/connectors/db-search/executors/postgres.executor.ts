import { Injectable, InternalServerErrorException, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { AppConfig } from '../../../config/configuration';
import { ValidatedQuery } from '../query-validator.service';

const STATEMENT_TIMEOUT_MS = 15_000;

/**
 * Executes a validated, read-only SELECT against one of the named Postgres
 * data sources in config/configuration.ts (`dataSource` in
 * usecase-config.schema.ts selects which one). One connection pool per
 * source, created lazily and reused across requests.
 *
 * SECURITY: see the comment on PRIMARYCARENG_SIT_DATABASE_URL in
 * configuration.ts -- this currently runs as the same superuser as the
 * main app DB, not a dedicated read-only role. `statement_timeout` and the
 * validator's LIMIT clamp are the operational safety net until one is
 * provisioned.
 */
@Injectable()
export class PostgresExecutor implements OnModuleDestroy {
  private readonly pools = new Map<string, Pool>();

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async execute(dataSource: string, query: ValidatedQuery): Promise<Record<string, unknown>[]> {
    const pool = this.getPool(dataSource);
    const result = await pool.query(query.sql);
    return result.rows;
  }

  private getPool(dataSource: string): Pool {
    const existing = this.pools.get(dataSource);
    if (existing) return existing;

    const connectionString = this.resolveConnectionString(dataSource);
    const pool = new Pool({ connectionString, statement_timeout: STATEMENT_TIMEOUT_MS, max: 5 });
    this.pools.set(dataSource, pool);
    return pool;
  }

  private resolveConnectionString(dataSource: string): string {
    if (dataSource === 'primarycareng_sit') {
      const url = this.configService.get('PRIMARYCARENG_SIT_DATABASE_URL', { infer: true });
      if (!url) {
        throw new InternalServerErrorException('PRIMARYCARENG_SIT_DATABASE_URL is not configured');
      }
      return url;
    }
    throw new InternalServerErrorException(`No Postgres connection configured for data source "${dataSource}"`);
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.pools.values()].map((pool) => pool.end()));
  }
}
