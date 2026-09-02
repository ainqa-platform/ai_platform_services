import pdfParse from 'pdf-parse';

/**
 * Node-side PDF text extraction for the ingestion pipeline (deliberately
 * NOT the browser's pdfjs-dist usage in ChatInterface.jsx -- ingestion needs
 * deterministic, server-controlled, resumable processing that doesn't
 * depend on a browser tab staying open, see the approved plan). Uses
 * `pdf-parse` (a thin pdf.js wrapper built for Node) rather than pdfjs-dist
 * directly -- no browser worker setup needed server-side.
 */
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const result = await pdfParse(buffer);
  return result.text;
}
