import { type QueryResult } from 'chromadb';

import { getEnv } from '@/config/env';
import { type RerankResults } from '@/types/rag';

export class CohereService {
  /**
   * Fetches reranked results from Cohere's rerank API
   */
  async getRerankResults(
    documents: QueryResult,
    query: string,
  ): Promise<RerankResults> {
    const cohereResponse = await fetch('https://api.cohere.ai/v2/rerank', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getEnv().COHERE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'rerank-v3.5',
        query,
        documents: documents.documents[0],
      }),
    }).then((res) => res.json());
    return cohereResponse;
  }
}
