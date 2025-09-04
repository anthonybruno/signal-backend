import { ChromaClient, type QueryResult } from 'chromadb';

import { getEnv } from '@/config/env';
import { CohereService } from '@/services/cohereService';
import { IntentEmbeddingsService } from '@/services/intentEmbeddingsService';
import { type ChatMessage } from '@/types/index';
import { type RetrievalDecision, type IntentEmbeddings } from '@/types/rag';
import { DocumentProcessor } from '@/utils/documentProcessor';
import { generateEmbedding } from '@/utils/embeddings';
import { logger } from '@/utils/logger';
import { cosineSimilarity } from '@/utils/vectorUtils';

export class RAGService {
  private readonly collectionName: string;
  private readonly intentEmbeddingsService: IntentEmbeddingsService;
  private readonly cohereService: CohereService;
  private readonly documentProcessor: DocumentProcessor;
  private readonly chromaClient: ChromaClient;

  constructor() {
    this.collectionName = getEnv().CHROMA_COLLECTION;
    this.intentEmbeddingsService = new IntentEmbeddingsService();
    this.cohereService = new CohereService();
    this.documentProcessor = new DocumentProcessor();
    this.chromaClient = new ChromaClient();
  }

  public async generateContext(query: string): Promise<ChatMessage[]> {
    logger.info(`Finding relevant context for query: ${query}`);

    // Start both operations in parallel
    const [queryEmbedding, intentEmbeddings] = await Promise.all([
      generateEmbedding([query]),
      this.intentEmbeddingsService.loadIntentEmbeddings(),
    ]);

    // Classify query
    const { bestIntent, bestScore } = this.classifyQuery(
      queryEmbedding[0],
      intentEmbeddings,
    );

    // Get retrieval strategy
    const retrievalStrategy = this.decideRetrievalStrategy(
      bestIntent,
      bestScore,
    );

    // Query Chroma
    const chromaResults = await this.queryChroma(query, retrievalStrategy);
    if (!chromaResults) return [];

    // Process results
    const cohereResults = await this.cohereService.getRerankResults(
      chromaResults,
      query,
    );
    const rankedDocuments = this.documentProcessor.createRankedDocuments(
      cohereResults,
      chromaResults,
    );
    const filteredDocuments = this.documentProcessor.filterDocumentsByRelevance(
      retrievalStrategy.retrievalCutoff,
      rankedDocuments,
    );

    return this.documentProcessor.convertToChatMessages(filteredDocuments);
  }

  private decideRetrievalStrategy(
    intent: string,
    score: number,
  ): RetrievalDecision {
    if (score >= 0.6) {
      logger.info('Strong match');
      return {
        retrievalCutoff: intent === 'resume' ? 0 : 0.2,
        metadata: { source: intent },
        top_k: 20,
      };
    }

    if (score >= 0.4) {
      logger.info('Middle match');
      return {
        retrievalCutoff: 0.7,
        metadata: null,
        top_k: 10,
      };
    }

    logger.info('Uncertain match');
    return {
      retrievalCutoff: 0.4,
      metadata: null,
      top_k: 25,
    };
  }

  private classifyQuery(
    queryEmbedding: number[],
    intentEmbeddings: IntentEmbeddings,
  ): { bestIntent: string; bestScore: number } {
    let bestIntent = 'unknown';
    let bestScore = -Infinity;

    for (const [intent, protoVecs] of Object.entries(intentEmbeddings)) {
      for (const protoVec of protoVecs) {
        const score = cosineSimilarity(queryEmbedding, [protoVec]);
        if (score > bestScore) {
          bestScore = score;
          bestIntent = intent;
        }
      }
    }

    return {
      bestIntent,
      bestScore: Math.round(bestScore * 100) / 100,
    };
  }

  private async queryChroma(
    query: string,
    retrievalStrategy: RetrievalDecision,
  ): Promise<QueryResult | null> {
    const collection = await this.chromaClient.getCollection({
      name: this.collectionName,
    });
    const chromaResults: QueryResult = await collection.query({
      queryTexts: [query],
      where: retrievalStrategy.metadata || undefined,
      nResults: retrievalStrategy.top_k,
    });

    if (chromaResults.documents[0].length === 0) {
      logger.warn(`No documents found in Chroma for query: "${query}"`, {
        retrievalStrategy,
      });
      return null;
    }
    return chromaResults;
  }
}
