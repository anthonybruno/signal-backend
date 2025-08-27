import { OpenAIEmbeddingFunction, type ChromaClient } from 'chromadb';

import { getEnv } from '@/config/env';
import type { ChatRequest, ChatMessage } from '@/types';
import { logger } from '@/utils/logger';
import { createMessages } from '@/utils/prompts';

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

  async searchSimilarContent(
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

      const messages = createMessages(request, { context });
      await llmService.streamResponse(messages, { onChunk });
    } catch (_error) {
      await fallbackHandler(request, onChunk);
    }
  }

  private async retrieveContext(message: string): Promise<string | null> {
    const searchResults = await this.searchSimilarContent(message, 20);

    if (searchResults.results.length === 0) {
      logger.info('RAG: No documents retrieved');
      return null;
    }

    const sortedResults = searchResults.results.sort(
      (a, b) => (a.distance || 1) - (b.distance || 1),
    );

    const maxTotalLength = 10000;
    let totalLength = 0;
    const selectedChunks: typeof sortedResults = [];

    const topRelevant = sortedResults.slice(0, 3);
    for (const result of topRelevant) {
      if (totalLength + result.content.length > maxTotalLength) break;
      selectedChunks.push(result);
      totalLength += result.content.length;
    }

    const remainingChunks = sortedResults.slice(20);
    const usedSources = new Set(selectedChunks.map((c) => c.metadata?.source));
    const usedSections = new Set(
      selectedChunks.map((c) => c.metadata?.section),
    );

    for (const result of remainingChunks) {
      if (totalLength + result.content.length > maxTotalLength) break;

      const source = result.metadata?.source;
      const section = result.metadata?.section;

      const isNewSource = source && !usedSources.has(source);
      const isNewSection = section && !usedSections.has(section);

      if (isNewSource || isNewSection) {
        selectedChunks.push(result);
        totalLength += result.content.length;
        if (source) usedSources.add(source);
        if (section) usedSections.add(section);
      }
    }

    for (const result of remainingChunks) {
      if (totalLength + result.content.length > maxTotalLength) break;
      if (!selectedChunks.includes(result)) {
        selectedChunks.push(result);
        totalLength += result.content.length;
      }
    }

    const context = selectedChunks
      .map((result) => {
        const source = result.metadata?.source as string;
        const section = result.metadata?.section as string;
        const chunkIndex = result.metadata?.chunkIndex as number;
        const totalChunks = result.metadata?.totalChunks as number;

        let header = '';
        if (source && section) {
          header = `[From ${source} - ${section}`;
          if (
            typeof chunkIndex === 'number' &&
            typeof totalChunks === 'number'
          ) {
            header += ` (chunk ${chunkIndex + 1} of ${totalChunks})`;
          }
          header += ']\n';
        }

        return `${header}${result.content}`;
      })
      .join('\n\n---\n\n');

    return context;
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

  // Public method to get RAG context for tool execution
  async getContextForTool(message: string): Promise<string> {
    const context = await this.retrieveContext(message);
    return context || 'No relevant context found.';
  }
}
