import { parse } from 'csv-parse/sync';

/**
 * Node-side CSV -> text extraction (no papaparse dependency needed
 * server-side -- csv-parse handles quoting/escaping correctly, unlike a
 * hand-rolled split). Rows are flattened into readable lines rather than
 * kept as a structured table, since the output feeds an LLM context window
 * as plain text.
 */
export async function extractCsvText(buffer: Buffer): Promise<string> {
  const records: string[][] = parse(buffer, { skip_empty_lines: true, relax_column_count: true });
  return records.map((row) => row.join(', ')).join('\n');
}
