import mammoth from 'mammoth';

/** Node-side DOCX text extraction (mammoth is already Node-first, unlike pdf/OCR). */
export async function extractDocxText(buffer: Buffer): Promise<string> {
  const result = await mammoth.extractRawText({ buffer });
  return result.value;
}
