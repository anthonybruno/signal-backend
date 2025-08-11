import { OpenAIEmbeddingFunction, type ChromaClient } from 'chromadb';

import { getEnv } from '@/config/env';
import type { ChatRequest, ChatMessage } from '@/types';
import { logger } from '@/utils/logger';
import { RAG_SYSTEM_PROMPT } from '@/utils/prompts';

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

    this.chromaClient = new ChromaClient({ path });
    await this.chromaClient.heartbeat();
    return this.chromaClient;
  }

  private createEmbeddingFunction(): OpenAIEmbeddingFunction {
    if (this.embeddingFunction) return this.embeddingFunction;

    this.embeddingFunction = new OpenAIEmbeddingFunction({
      openai_api_key: getEnv().OPENAI_API_KEY,
      openai_model: 'text-embedding-3-small',
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

  async searchSimilarContent(
    query: string,
    resultCount = 5,
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

  async executeRAGFlow(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    llmService: {
      streamResponse: (
        messages: ChatMessage[],
        options: { onChunk: (chunk: string) => void },
      ) => Promise<unknown>;
    },
    fallbackHandler: (
      request: ChatRequest,
      onChunk: (chunk: string) => void,
    ) => Promise<void>,
  ): Promise<void> {
    try {
      const context = await this.retrieveContext(request.message);
      if (!context) {
        await fallbackHandler(request, onChunk);
        return;
      }

      const messages = this.createRAGMessages(request, context);
      await llmService.streamResponse(messages, { onChunk });
    } catch (_error) {
      await fallbackHandler(request, onChunk);
    }
  }

  private async retrieveContext(message: string): Promise<string | null> {
    const searchResults = await this.searchSimilarContent(message, 3);
    const retrievedChunks = searchResults.results.map(
      (result) => result.content,
    );
    return retrievedChunks.length > 0 ? retrievedChunks.join('\n\n') : null;
  }

  private createRAGMessages(
    request: ChatRequest,
    context: string,
  ): ChatMessage[] {
    const { message, history = [] } = request;
    const contextMessage = `Context about Anthony Bruno:\n${context}\n\nUser question: ${message}`;

    return [
      { role: 'system', content: RAG_SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: contextMessage },
    ];
  }

  async getCollectionStatus() {
    try {
      const collection = await this.retrieveCollection();
      const count = await collection.count();

      return {
        name: this.collectionName,
        documentCount: count,
        status: 'available',
      };
    } catch (_error) {
      return {
        name: this.collectionName,
        documentCount: 0,
        status: 'unavailable',
      };
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      await this.retrieveCollection();
      return true;
    } catch {
      return false;
    }
  }
}
