import axios, { AxiosInstance } from 'axios';
import { getEnv } from '@/config/env';
import { logger } from '@/utils/logger';

let chromaClient: AxiosInstance | null = null;

export const initializeChromaDB = async (): Promise<AxiosInstance> => {
  if (chromaClient) {
    return chromaClient;
  }

  const env = getEnv();

  try {
    // Determine protocol based on port
    const protocol = env.CHROMA_PORT === 443 ? 'https' : 'http';
    const baseURL = `${protocol}://${env.CHROMA_HOST}${env.CHROMA_PORT !== 443 ? `:${env.CHROMA_PORT}` : ''}`;

    logger.info(`Connecting to ChromaDB at: ${baseURL}`);

    chromaClient = axios.create({
      baseURL,
      timeout: 10000,
    });

    // Test connection with v2 API
    await chromaClient.get('/api/v2/heartbeat');
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
    // Get existing collection (no embedding function needed for querying)
    await client.get(`/api/v2/collections/${collectionName}`);

    logger.info(`Using collection for querying: ${collectionName}`);
    return {
      query: async (params: Record<string, unknown>) => {
        const queryResponse = await client.post(
          `/api/v2/collections/${collectionName}/query`,
          params,
        );
        return queryResponse.data;
      },
    };
  } catch (error) {
    logger.error(`Collection ${collectionName} not found:`, error);
    throw new Error(
      `Collection ${collectionName} not found. Run embedding setup in RAG repo first.`,
    );
  }
};
