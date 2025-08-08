import { OpenAIEmbeddingFunction, type ChromaClient } from 'chromadb';

import { getEnv } from '@/config/env';
import { logger } from '@/utils/logger';

let chromaClient: ChromaClient | null = null;
let embeddingFunction: OpenAIEmbeddingFunction | null = null;

export const initializeChromaDB = async (): Promise<ChromaClient> => {
  if (chromaClient) {
    return chromaClient;
  }

  const env = getEnv();

  try {
    // Initialize ChromaDB client
    const { ChromaClient } = await import('chromadb');

    // Determine protocol based on port
    const protocol = env.CHROMA_PORT === 443 ? 'https' : 'http';
    const path = `${protocol}://${env.CHROMA_HOST}${env.CHROMA_PORT !== 443 ? `:${env.CHROMA_PORT}` : ''}`;

    logger.info(`Connecting to ChromaDB at: ${path}`);

    chromaClient = new ChromaClient({
      path,
    });

    // Test connection
    await chromaClient.heartbeat();
    logger.info('ChromaDB connection established');

    return chromaClient;
  } catch (error) {
    logger.error('Failed to connect to ChromaDB:', error);
    throw new Error(
      'ChromaDB connection failed. Make sure ChromaDB is running.',
    );
  }
};

export const getEmbeddingFunction = (): OpenAIEmbeddingFunction => {
  if (embeddingFunction) {
    return embeddingFunction;
  }

  const env = getEnv();

  // Use OpenAI directly for embeddings
  embeddingFunction = new OpenAIEmbeddingFunction({
    openai_api_key: env.OPENAI_API_KEY,
    openai_model: 'text-embedding-3-small',
  });

  return embeddingFunction;
};

// Simple function to get existing collection for querying only
export const getCollectionForQuery = async (collectionName: string) => {
  const client = await initializeChromaDB();
  const embeddingFn = getEmbeddingFunction();

  try {
    // Get existing collection with embedding function
    const collection = await client.getCollection({
      name: collectionName,
      embeddingFunction: embeddingFn, // ← This is the key fix!
    });

    logger.info(`Using collection for querying: ${collectionName}`);
    return collection;
  } catch (error) {
    logger.error(`Collection ${collectionName} not found:`, error);
    throw new Error(
      `Collection ${collectionName} not found. Run embedding setup in RAG repo first.`,
    );
  }
};

export interface SearchResult {
  query: string;
  results: Array<{
    content: string;
    metadata?: Record<string, unknown>;
    distance?: number;
    id?: string;
  }>;
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
  async searchSimilar(query: string, nResults = 5): Promise<SearchResult> {
    try {
      const collection = await getCollectionForQuery(this.collectionName);

      const results = await collection.query({
        queryTexts: [query],
        nResults,
      });

      logger.info(
        `Searching for: "${query}" (found ${results.documents[0]?.length ?? 0} results)`,
      );

      return {
        query,
        results:
          results.documents[0]
            ?.map((doc: string | null, index: number) => ({
              content: doc,
              metadata: results.metadatas[0][index],
              distance: results.distances?.[0]?.[index],
              id: results.ids[0][index],
            }))
            .filter(
              (result: { content: string | null }) => result.content !== null,
            )
            .map(
              (result: {
                content: string | null;
                metadata?: Record<string, unknown> | null;
                distance?: number;
                id?: string;
              }) => ({
                content: result.content as string,
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
      const collection = await getCollectionForQuery(this.collectionName);

      // Get count using the collection's count method
      const count = await collection.count();

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
