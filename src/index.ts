import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';

import { initializeChromaDB, isChromaConnected } from '@/config/database';
import { getEnv } from '@/config/env';
import { createRateLimiter } from '@/middleware/rateLimit';
import { router as chatRoutes } from '@/routes/chat';
import { IntentEmbeddingsService } from '@/services/rag/intentEmbeddingsService';
import { logger } from '@/utils/logger';

dotenv.config();

const app = express();
const { PORT } = getEnv();

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: getEnv().ALLOWED_ORIGINS.split(','),
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
app.use(createRateLimiter());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check route
app.get('/health', (_, res) => {
  const chromaStatus = isChromaConnected() ? 'connected' : 'disconnected';

  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    services: {
      chromaDB: chromaStatus,
    },
  });
});

// API routes
app.use('/chat', chatRoutes);

// 404 handler (must be last)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

const initializeServices = async () => {
  try {
    await initializeChromaDB();
    const intentEmbeddingsService = new IntentEmbeddingsService();
    await intentEmbeddingsService.initialize();
  } catch (_error) {
    if (getEnv().NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

const server = app.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
});

// Initialize services after server starts
initializeServices().catch((error) => {
  logger.error('Failed to initialize services:', error);
});

const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received, shutting down gracefully...`);
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
