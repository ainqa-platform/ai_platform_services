import { BadRequestException, Injectable } from '@nestjs/common';
import { AST, Parser, Select } from 'node-sql-parser';

export interface QueryIntent {
  /** Candidate SQL text -- untrusted until this service approves it. */
  sql: string;
}

export interface ValidatedQuery {
  sql: string;
}

const DIALECT = { database: 'postgresql' } as const;

/**
 * The safety gate between LLM-generated SQL and execution (see the plan's
 * "Safety model for db-search/db-analytics" and nl-to-query.service.ts for
 * why this validates SQL text rather than a structured intent). Verified
 * directly against `node-sql-parser` v5's actual behavior (not assumed):
 * `astify()` returns an ARRAY for multi-statement input and a single object
 * for one statement, `tableList()` entries are `"<verb>::<schema>::<table>"`,
 * and `ast.limit` can be mutated and re-serialized via `sqlify()` to inject/
 * clamp a LIMIT.
 *
 * This mirrors the discipline already used for Arango access elsewhere in
 * this codebase (src/constants/query_id.js -- pre-registered queryid +
 * filter object, never raw AQL from the client): same idea, now applied to
 * LLM-generated rather than developer-authored queries.
 */
@Injectable()
export class QueryValidatorService {
  private readonly parser = new Parser();

  validate(intent: QueryIntent, allowedTables: string[], rowLimit: number): ValidatedQuery {
    const allowedSet = new Set(allowedTables.map((t) => t.toLowerCase()));

    let ast: AST | AST[];
    try {
      ast = this.parser.astify(intent.sql, DIALECT);
    } catch (err) {
      throw new BadRequestException(`Generated SQL could not be parsed: ${err instanceof Error ? err.message : err}`);
    }

    if (Array.isArray(ast)) {
      throw new BadRequestException('Generated SQL must be a single statement');
    }
    if (ast.type !== 'select') {
      throw new BadRequestException(`Generated SQL must be a SELECT statement, got "${ast.type}"`);
    }
    const statement: Select = ast;

    let tables: string[];
    try {
      tables = this.parser.tableList(intent.sql, DIALECT);
    } catch (err) {
      throw new BadRequestException(
        `Could not extract tables from generated SQL: ${err instanceof Error ? err.message : err}`,
      );
    }
    for (const entry of tables) {
      const [verb, , table] = entry.split('::');
      if (verb.toLowerCase() !== 'select') {
        throw new BadRequestException(`Generated SQL references a non-SELECT operation on "${table}"`);
      }
      if (!allowedSet.has(table.toLowerCase())) {
        throw new BadRequestException(
          `Generated SQL references table "${table}", which is not in this usecase's allowlist`,
        );
      }
    }
    if (tables.length === 0) {
      throw new BadRequestException('Generated SQL does not reference any table');
    }

    const clampedLimit = Math.min(rowLimit, 1000);
    if (!statement.limit || statement.limit.value.length === 0) {
      statement.limit = { seperator: '', value: [{ type: 'number', value: clampedLimit }] };
    } else if (statement.limit.value[0].value > clampedLimit) {
      statement.limit.value[0].value = clampedLimit;
    }

    const sql = this.parser.sqlify(statement, DIALECT);
    return { sql };
  }
}
