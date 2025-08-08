import { Router, type Request, type Response } from 'express';

import { initializeChromaDB } from '@/config/database';
import { getEnv } from '@/config/env';

const router = Router();

/**
 * Gets memory usage in MB
 */
function getMemoryUsage() {
  const memoryUsage = process.memoryUsage();
  return {
    rss: Math.round(memoryUsage.rss / 1024 / 1024),
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    external: Math.round(memoryUsage.external / 1024 / 1024),
  };
}

/**
 * Checks ChromaDB health
 */
async function checkChromaHealth(): Promise<boolean> {
  try {
    await initializeChromaDB();
    return true;
  } catch (error) {
    console.error('ChromaDB health check failed:', error);
    return false;
  }
}

/**
 * Gets dependency checks
 */
async function getDependencyChecks() {
  const env = getEnv();
  const chromaHealth = await checkChromaHealth();

  return {
    openrouter: {
      configured: !!env.OPENROUTER_API_KEY,
      status: 'unknown', // Will be updated when we implement LLM service
    },
    vectorDB: {
      configured: !!(env.CHROMA_HOST && env.CHROMA_PORT),
      status: chromaHealth ? 'healthy' : 'unhealthy',
    },
  };
}

// Basic health check
router.get('/', (_: Request, res: Response) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env['NODE_ENV'] ?? 'development',
  });
});

// Detailed health check with dependencies
router.get('/detailed', async (_: Request, res: Response) => {
  try {
    const env = getEnv();
    const memoryInMB = getMemoryUsage();
    const dependencies = await getDependencyChecks();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: process.version,
      memory: memoryInMB,
      dependencies,
      config: {
        maxContextLength: 16000,
        maxResponseTokens: 4000,
        defaultModel: env.DEFAULT_MODEL,
      },
    });
  } catch (error) {
    console.error('Detailed health check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Health check failed',
    });
  }
});

export { router };
