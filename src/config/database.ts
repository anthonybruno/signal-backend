import { getEnv } from '@/config/env';
import { logger } from '@/utils/logger';

import type { ChromaClient } from 'chromadb';

let chromaClient: ChromaClient | null = null;

/**
 * Initializes and returns a ChromaDB client instance.
 * Creates a singleton connection that's reused across the application.
 */
export const initializeChromaDB = async (): Promise<ChromaClient> => {
  if (chromaClient) {
    return chromaClient;
  }

  const env = getEnv();

  try {
    const { ChromaClient } = await import('chromadb');

    const protocol = env.CHROMA_PORT === 443 ? 'https' : 'http';
    const port = env.CHROMA_PORT !== 443 ? `:${env.CHROMA_PORT}` : '';
    const connectionUrl = `${protocol}://${env.CHROMA_HOST}${port}`;

    logger.info(`Connecting to ChromaDB at: ${connectionUrl}`);

    chromaClient = new ChromaClient({ path: connectionUrl });

    await chromaClient.heartbeat();
    logger.info('ChromaDB connection established');

    return chromaClient;
  } catch (error) {
    logger.error('Failed to connect to ChromaDB:', error);
    throw new Error('ChromaDB connection failed. Ensure ChromaDB is running.');
  }
};

/**
 * Retrieves a ChromaDB collection for querying operations.
 * @param collectionName - Name of the collection to retrieve
 * @returns Promise resolving to the collection instance
 */
export const getCollectionForQuery = async (collectionName: string) => {
  const client = await initializeChromaDB();

  try {
    const collection = await client.getCollection({ name: collectionName });
    logger.info(`Retrieved collection: ${collectionName}`);
    return collection;
  } catch (error) {
    logger.error(`Collection ${collectionName} not found:`, error);
    throw new Error(
      `Collection ${collectionName} not found. Run embedding setup in RAG repo first.`,
    );
  }
};
