import { Router, Request, Response } from 'express';
import { asyncHandler } from '@/middleware/errorHandler';
import { getEnv } from '@/config/env';
import { initializeChromaDB } from '@/config/database';

const router = Router();

// Basic health check
router.get(
  '/',
  asyncHandler(async (_: Request, res: Response) => {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env['NODE_ENV'] ?? 'development',
    });
  }),
);

// Detailed health check with dependencies
router.get(
  '/detailed',
  asyncHandler(async (_: Request, res: Response) => {
    const env = getEnv();

    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const memoryInMB = {
      rss: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      external: Math.round(memoryUsage.external / 1024 / 1024),
    };

    // Check ChromaDB health
    let chromaHealth = false;
    try {
      await initializeChromaDB();
      chromaHealth = true;
    } catch (error) {
      console.error('ChromaDB health check failed:', error);
    }

    // Basic dependency checks
    const checks = {
      openrouter: {
        configured: !!env.OPENROUTER_API_KEY,
        status: 'unknown', // Will be updated when we implement LLM service
      },
      vectorDB: {
        configured: !!(env.CHROMA_HOST && env.CHROMA_PORT),
        status: chromaHealth ? 'healthy' : 'unhealthy',
      },
    };

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: env.NODE_ENV,
      version: process.version,
      memory: memoryInMB,
      dependencies: checks,
      config: {
        maxContextLength: 16000,
        maxResponseTokens: 4000,
        temperature: 0.7,
        defaultModel: env.DEFAULT_MODEL,
      },
    });
  }),
);

export default router;
