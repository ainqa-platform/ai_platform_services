import { Injectable } from '@nestjs/common';

export interface Chunk {
  index: number;
  content: string;
}

/**
 * Splits extracted document text into overlapping chunks sized per the
 * usecase's `config.chunkSize`/`chunkOverlap`. Simplification: chunkSize/
 * chunkOverlap are treated as word counts, not true LLM tokens -- a real
 * tokenizer (e.g. tiktoken) would need a model-specific encoding and adds a
 * dependency; word-count chunking is dependency-free and close enough for
 * a first cut (roughly 0.75 words/token in English, so a chunkSize of 800
 * undershoots an 800-token budget a bit, not overshoots it -- the safer
 * direction to be wrong in).
 */
@Injectable()
export class ChunkerService {
  chunk(text: string, chunkSize: number, chunkOverlap: number): Chunk[] {
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];

    const step = Math.max(1, chunkSize - chunkOverlap);
    const chunks: Chunk[] = [];
    let index = 0;

    for (let start = 0; start < words.length; start += step) {
      const content = words.slice(start, start + chunkSize).join(' ');
      if (content.trim()) {
        chunks.push({ index: index++, content });
      }
      if (start + chunkSize >= words.length) break;
    }

    return chunks;
  }
}
