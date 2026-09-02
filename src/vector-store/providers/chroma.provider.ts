import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { VectorQueryResult, VectorRecord, VectorStoreProvider } from '../vector-store.interface';

interface ChromaCollection {
  id: string;
  name: string;
}

interface ChromaQueryResponse {
  ids: string[][];
  documents: (string | null)[][];
  metadatas: (Record<string, unknown> | null)[][];
  distances: number[][];
}

/**
 * Talks to a Chroma server's v2 REST API
 * (/api/v2/tenants/{tenant}/databases/{database}/collections/...).
 * Request/response shapes below were verified directly against a live
 * Chroma 0.6.2 instance (create/add/query/delete), not assumed from docs --
 * notably: add/query/delete-by-id require the collection's UUID, not its
 * name (the name-based path only works for DELETE .../collections/{name}),
 * which is why ensureCollection() resolves and caches the id up front.
 *
 * SECURITY NOTE: the instance this was verified against
 * (CHROMA_URL=http://164.52.211.42:8000, see server/.env) was found to be
 * reachable with zero authentication and already showed a ransom-note-style
 * collection ("ENCRYPTED_BY_JADEPUFFER") from an automated attack against
 * exposed, unauthenticated Chroma servers. CHROMA_AUTH_TOKEN below is wired
 * up so auth can be turned on server-side once that instance is secured --
 * this provider does not by itself make the instance safe to use.
 */
@Injectable()
export class ChromaProvider implements VectorStoreProvider {
  private readonly logger = new Logger(ChromaProvider.name);
  private readonly collectionIdCache = new Map<string, string>();

  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  async ensureCollection(collection: string): Promise<void> {
    if (this.collectionIdCache.has(collection)) return;

    const response = await this.request<ChromaCollection>('POST', '/collections', {
      name: collection,
      get_or_create: true,
    });
    this.collectionIdCache.set(collection, response.id);
  }

  async upsert(collection: string, records: VectorRecord[]): Promise<void> {
    if (records.length === 0) return;
    const id = await this.resolveCollectionId(collection);

    await this.request('POST', `/collections/${id}/upsert`, {
      ids: records.map((r) => r.id),
      embeddings: records.map((r) => r.embedding),
      documents: records.map((r) => r.content),
      metadatas: records.map((r) => r.metadata),
    });
  }

  async query(collection: string, embedding: number[], topK: number): Promise<VectorQueryResult[]> {
    const id = await this.resolveCollectionId(collection);

    const response = await this.request<ChromaQueryResponse>('POST', `/collections/${id}/query`, {
      query_embeddings: [embedding],
      n_results: topK,
      include: ['documents', 'metadatas', 'distances'],
    });

    const ids = response.ids[0] ?? [];
    const documents = response.documents[0] ?? [];
    const metadatas = response.metadatas[0] ?? [];
    const distances = response.distances[0] ?? [];

    return ids.map((chunkId, i) => ({
      id: chunkId,
      content: documents[i] ?? '',
      // Chroma's default space is L2 distance (lower = closer), not cosine
      // similarity -- callers should treat this as "lower is better", not
      // assume a 0-1 similarity score.
      score: distances[i],
      metadata: metadatas[i] ?? {},
    }));
  }

  async deleteByDocument(collection: string, documentId: string): Promise<void> {
    const id = await this.resolveCollectionId(collection);
    await this.request('POST', `/collections/${id}/delete`, { where: { documentId } });
  }

  private async resolveCollectionId(collection: string): Promise<string> {
    await this.ensureCollection(collection);
    const id = this.collectionIdCache.get(collection);
    if (!id) {
      throw new InternalServerErrorException(`Could not resolve Chroma collection id for "${collection}"`);
    }
    return id;
  }

  private async request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const baseUrl = this.configService.get('CHROMA_URL', { infer: true });
    if (!baseUrl) {
      throw new InternalServerErrorException('CHROMA_URL is not configured');
    }
    const tenant = this.configService.get('CHROMA_TENANT', { infer: true });
    const database = this.configService.get('CHROMA_DATABASE', { infer: true });
    const authToken = this.configService.get('CHROMA_AUTH_TOKEN', { infer: true });

    const url = `${baseUrl.replace(/\/+$/, '')}/api/v2/tenants/${tenant}/databases/${database}${path}`;
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      this.logger.error(`Chroma request failed: ${method} ${path} -> ${response.status} ${text}`);
      throw new InternalServerErrorException(`Chroma request failed (${response.status})`);
    }
    return (await response.json()) as T;
  }
}
