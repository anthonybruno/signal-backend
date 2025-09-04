import { OpenAIEmbeddingFunction } from '@chroma-core/openai';

import { getEnv } from '@/config/env';

/**
 * Create a new OpenAI embedding function instance with configured settings.
 *
 * @returns {OpenAIEmbeddingFunction} Configured embedding function instance.
 */
export function createEmbeddingFunction(): OpenAIEmbeddingFunction {
  const env = getEnv();
  return new OpenAIEmbeddingFunction({
    apiKey: env.OPENAI_API_KEY,
    modelName: env.OPENAI_EMBEDDING_MODEL,
  });
}

/**
 * Generate embeddings for an array of documents using the OpenAI embedding model.
 *
 * @param {string[]} documents - The array of text documents to embed.
 * @returns {Promise<number[][]>} Embeddings for the input documents.
 */
export async function generateEmbedding(
  documents: string[],
): Promise<number[][]> {
  const embeddingFunction = createEmbeddingFunction();

  // Always return the full array of embeddings
  const embeddings = await embeddingFunction.generate(documents);
  return embeddings;
}
