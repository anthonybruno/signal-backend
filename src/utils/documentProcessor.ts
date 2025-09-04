import { type QueryResult } from 'chromadb';

import { type ChatMessage } from '@/types/index';
import {
  type RerankResults,
  type RankedDocument,
  type ChromaMetadata,
} from '@/types/rag';

import { logger } from './logger';

export class DocumentProcessor {
  /**
   * Creates ranked documents by combining Cohere rerank results with ChromaDB metadata
   */
  createRankedDocuments(
    cohereResults: RerankResults,
    chromaResults: QueryResult,
  ): RankedDocument[] {
    const documents = chromaResults.documents[0] as [];
    const metadatas = chromaResults.metadatas[0] as unknown as ChromaMetadata[];

    const rankedDocuments = cohereResults.results.map((result) => ({
      text: documents[result.index],
      source: metadatas[result.index].source,
      relevance: Math.round(result.relevance_score * 1000) / 1000,
    }));
    logger.info('Ranked documents:', rankedDocuments);
    return rankedDocuments;
  }

  /**
   * Filters documents based on a relevance threshold
   */
  filterDocumentsByRelevance(
    retrievalCutoff: number,
    rankedDocuments: RankedDocument[],
  ): RankedDocument[] {
    return rankedDocuments.filter(
      (document) => document.relevance >= retrievalCutoff,
    );
  }

  /**
   * Converts ranked documents to ChatMessage format
   */
  convertToChatMessages(documents: RankedDocument[]): ChatMessage[] {
    return documents.map((doc) => ({
      role: 'assistant',
      content: `[Source: ${doc.source} | Relevance: ${doc.relevance}] ${doc.text}`,
    }));
  }
}
