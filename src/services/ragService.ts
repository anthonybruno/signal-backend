import { OpenAIEmbeddingFunction, type ChromaClient } from 'chromadb';

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

export class RAGService {
  private chromaClient: ChromaClient | null = null;
  private embeddingFunction: OpenAIEmbeddingFunction | null = null;
  private readonly collectionName: string;

  constructor() {
    this.collectionName = getEnv().CHROMA_COLLECTION;
  }

  private async initializeChromaClient(): Promise<ChromaClient> {
    if (this.chromaClient) return this.chromaClient;

    const env = getEnv();
    const { ChromaClient } = await import('chromadb');

    const protocol = env.CHROMA_PORT === 443 ? 'https' : 'http';
    const path = `${protocol}://${env.CHROMA_HOST}${env.CHROMA_PORT !== 443 ? `:${env.CHROMA_PORT}` : ''}`;

    this.chromaClient = new ChromaClient({
      path,
    });
    await this.chromaClient.heartbeat();
    return this.chromaClient;
  }

  private createEmbeddingFunction(): OpenAIEmbeddingFunction {
    if (this.embeddingFunction) return this.embeddingFunction;

    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: getEnv().OPENAI_API_KEY,
      openai_model: 'text-embedding-3-large',
    });

    return this.embeddingFunction;
  }

  private async retrieveCollection() {
    try {
      const client = await this.initializeChromaClient();
      const embeddingFunction = this.createEmbeddingFunction();

      return await client.getCollection({
        name: this.collectionName,
        embeddingFunction,
      });
    } catch (_error) {
      throw new Error(
        `Collection ${this.collectionName} not found. Run embedding setup in RAG repo first.`,
      );
    }
  }

  async findRelevantContext(
    query: string,
    resultCount = 10,
  ): Promise<SearchResult> {
    try {
      const collection = await this.retrieveCollection();
      const results = await collection.query({
        queryTexts: [query],
        nResults: resultCount,
      });

      const documents = results.documents[0] || [];
      const metadatas = results.metadatas[0] || [];
      const distances = results.distances?.[0] || [];
      const ids = results.ids[0] || [];

      const searchResults = documents
        .map((document, index) => ({
          content: document,
          metadata: metadatas[index],
          distance: distances[index],
          id: ids[index],
        }))
        .filter((result) => result.content !== null)
        .map((result) => ({
          content: result.content as string,
          metadata: result.metadata ?? undefined,
          distance: result.distance,
          id: result.id,
        }));

      return { query, results: searchResults };
    } catch (_error) {
      logger.warn('ChromaDB unavailable, returning empty results');
      return { query, results: [] };
    }
  }
}
