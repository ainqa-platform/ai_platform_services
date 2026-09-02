import { createWorker } from 'tesseract.js';

/**
 * Node-side OCR extraction (tesseract.js has a Node worker path, unlike the
 * browser worker used in ChatInterface.jsx). NOTE: `createWorker('eng')`
 * downloads the English traineddata + wasm core from tesseract.js's default
 * CDN on first use unless configured with local model paths -- this needs
 * outbound network access the first time it runs on a given host. For an
 * offline/air-gapped deployment, pre-fetch the traineddata and pass
 * `langPath`/`corePath` options to `createWorker` instead.
 */
export async function extractImageText(buffer: Buffer): Promise<string> {
  const worker = await createWorker('eng');
  try {
    const {
      data: { text },
    } = await worker.recognize(buffer);
    return text;
  } finally {
    await worker.terminate();
  }
}
