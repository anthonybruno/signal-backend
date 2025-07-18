import { getCollectionForQuery } from '@/config/database';
import { getEnv } from '@/config/env';
import { logger } from '@/utils/logger';

export interface SearchResult {
  query: string;
  results: Array<{
    content: string;
    metadata?: Record<string, unknown>;
    distance?: number;
    id?: string;
  }>;
}

interface ChromaDBQueryResult {
  documents: (string | null)[][];
  metadatas?: Record<string, unknown>[][];
  distances?: number[][];
  ids?: string[][];
}

export class EmbeddingService {
  private collectionName: string;

  constructor() {
    const env = getEnv();
    this.collectionName = env.CHROMA_COLLECTION;
  }

  /**
   * Search for similar content in existing embeddings
   * This method queries pre-computed embeddings from ChromaDB
   */
  async searchSimilar(query: string, nResults: number = 5): Promise<SearchResult> {
    try {
      const collection = await getCollectionForQuery(this.collectionName);

      const results = (await collection.query({
        query_texts: [query], // Note: changed from queryTexts to query_texts (ChromaDB API format)
        n_results: nResults, // Note: changed from nResults to n_results
      })) as ChromaDBQueryResult;

      logger.info(`Searching for: "${query}" (found ${results.documents[0]?.length ?? 0} results)`);

      return {
        query,
        results:
          results.documents[0]
            ?.map((doc: string | null, index: number) => ({
              content: doc,
              metadata: results.metadatas?.[0]?.[index],
              distance: results.distances?.[0]?.[index],
              id: results.ids?.[0]?.[index],
            }))
            .filter((result: { content: string | null }) => result.content !== null)
            .map(
              (result: {
                content: string | null;
                metadata?: Record<string, unknown>;
                distance?: number;
                id?: string;
              }) => ({
                content: result.content!,
                metadata: result.metadata ?? undefined,
                distance: result.distance,
                id: result.id,
              }),
            ) ?? [],
      };
    } catch (error) {
      logger.error('Error searching documents:', error);
      logger.warn('ChromaDB unavailable, returning empty search results');

      // Return empty results instead of throwing to allow graceful degradation
      return {
        query,
        results: [],
      };
    }
  }

  /**
   * Get collection information (for debugging/monitoring)
   */
  async getCollectionInfo() {
    try {
      const client = await getCollectionForQuery(this.collectionName);

      // Get count via HTTP API
      const countResponse = (await client.query({
        query_texts: [''],
        n_results: 1,
      })) as ChromaDBQueryResult;
      const count = countResponse.ids?.[0]?.length ?? 0;

      return {
        name: this.collectionName,
        documentCount: count,
        status: 'available',
      };
    } catch (error) {
      logger.error('Error getting collection info:', error);
      return {
        name: this.collectionName,
        documentCount: 0,
        status: 'unavailable',
      };
    }
  }

  /**
   * Check if RAG service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      await getCollectionForQuery(this.collectionName);
      return true;
    } catch {
      return false;
    }
  }
}
