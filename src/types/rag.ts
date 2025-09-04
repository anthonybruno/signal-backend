export interface SearchResult {
  query: string;
  results: Array<{
    content: string;
    metadata?: Record<string, unknown>;
    distance?: number;
    id?: string;
  }>;
}

export interface IntentEmbeddings {
  [key: string]: number[];
}

export interface RetrievalDecision {
  retrievalCutoff: number;
  metadata?: { source: string } | null;
  top_k: number;
}

export interface RerankResults {
  results: {
    index: number;
    relevance_score: number;
  }[];
}

export interface RankedDocument {
  text: string;
  source: string;
  relevance: number;
}

export interface ChromaMetadata {
  source: string;
}
