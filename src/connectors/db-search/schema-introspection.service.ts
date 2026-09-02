import { Injectable } from '@nestjs/common';
import { DataDictionaryTable } from '../../usecases/dto/usecase-config.schema';

/**
 * Formats a usecase's hand-curated `config.dataDictionary` (see
 * usecase-config.schema.ts for why it's curated rather than
 * live-introspected) into prompt text for nl-to-query.service.ts. The LLM
 * only ever sees tables/columns listed here -- it has no way to discover or
 * reference anything outside this text, which is what keeps
 * query-validator.service.ts's allowlist check meaningful (the model is
 * never even shown a reason to name a table outside it).
 */
@Injectable()
export class SchemaIntrospectionService {
  describe(dataDictionary: DataDictionaryTable[]): string {
    if (dataDictionary.length === 0) {
      return 'No tables are documented for this usecase.';
    }
    return dataDictionary
      .map((t) => {
        const lines = [`Table: ${t.table}${t.description ? ` -- ${t.description}` : ''}`];
        for (const col of t.columns) {
          lines.push(`  - ${col.name}${col.description ? `: ${col.description}` : ''}`);
        }
        if (t.notes) {
          lines.push(`  Notes: ${t.notes}`);
        }
        return lines.join('\n');
      })
      .join('\n\n');
  }
}
