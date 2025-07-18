import { ChromaClient } from 'chromadb';
import { getEnv } from '@/config/env';
import { logger } from '@/utils/logger';

let chromaClient: ChromaClient | null = null;

export const initializeChromaDB = async (): Promise<ChromaClient> => {
  if (chromaClient) {
    return chromaClient;
  }

  const env = getEnv();

  try {
    // Initialize ChromaDB client (same as RAG service)
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
    throw new Error('ChromaDB connection failed. Make sure ChromaDB is running.');
  }
};

// Simple function to get existing collection for querying only
export const getCollectionForQuery = async (collectionName: string) => {
  const client = await initializeChromaDB();

  try {
    // Get existing collection (same as RAG service)
    const collection = await client.getCollection({
      name: collectionName,
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
