import { ChromaClient } from 'chromadb';

import { getEnv } from '@/config/env';

let client: ChromaClient | null = null;

export const initializeChromaDB = async (): Promise<ChromaClient> => {
  if (client) return client;

  try {
    client = new ChromaClient({
      host: getEnv().CHROMA_HOST,
      port: getEnv().CHROMA_PORT,
    });
    await client.heartbeat();
    return client;
  } catch (_error) {
    client = null;
    throw new Error('ChromaDB connection failed');
  }
};

export const getCollectionForQuery = async (collectionName: string) => {
  if (!client) throw new Error('ChromaDB not initialized');

  try {
    const collection = await client.getCollection({
      name: collectionName,
    });
    return collection;
  } catch (_error) {
    throw new Error(`Collection ${collectionName} not found`);
  }
};

export const isChromaConnected = (): boolean => client !== null;
