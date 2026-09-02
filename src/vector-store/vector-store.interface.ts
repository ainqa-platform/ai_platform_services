export interface VectorRecord {
  /** document_chunk.id (uuid) -- doubles as the vector store's point/vector id, no separate mapping needed. */
  id: string;
  embedding: number[];
  content: string;
  metadata: Record<string, unknown>;
}

export interface VectorQueryResult {
  id: string;
  content: string;
  score: number;
  metadata: Record<string, unknown>;
}

/**
 * One interface, multiple backends -- same pattern as
 * llm-gateway/interfaces/llm-provider.interface.ts. `collection` is a
 * logical namespace per usecase (see VectorStoreService.collectionFor);
 * providers map it onto whatever their backend calls a namespace (a Chroma
 * collection, or a `usecase_id` filter on the shared pgvector table).
 */
export interface VectorStoreProvider {
  ensureCollection(collection: string): Promise<void>;
  upsert(collection: string, records: VectorRecord[]): Promise<void>;
  query(collection: string, embedding: number[], topK: number): Promise<VectorQueryResult[]>;
  deleteByDocument(collection: string, documentId: string): Promise<void>;
}
