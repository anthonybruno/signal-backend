import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { logger } from '@/utils/logger';
import { errorHandler } from '@/middleware/errorHandler';
import { initializeChromaDB } from '@/config/database';

import healthRoutes from '@/routes/health';
import chatRoutes from '@/routes/chat';

// Add immediate console logging for debugging
console.log('Starting TonyBot Backend...');
console.log(`Current working directory: ${process.cwd()}`);
console.log(`NODE_ENV: ${process.env.NODE_ENV}`);
console.log(`PORT: ${process.env.PORT ?? 3000}`);

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '900000'), // 15 minutes
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '100'),
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use((req, _, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    timestamp: new Date().toISOString(),
  });
  next();
});

// Routes
app.use('/api/health', healthRoutes);
app.use('/api/chat', chatRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// Global error handler (must be last)
app.use(errorHandler);

// SIMPLIFIED: Just initialize ChromaDB connection (no embedding generation)
const initializeServices = async () => {
  try {
    console.log('Initializing ChromaDB connection...');
    await initializeChromaDB();
    console.log('ChromaDB connection established');
    logger.info('Backend ready: ChromaDB connection established');
  } catch (error) {
    console.error('ChromaDB connection failed:', error);
    logger.error('Backend degraded: ChromaDB connection failed. RAG features will be disabled.');
    if (process.env.LOG_LEVEL === 'debug') {
      logger.error(error);
    }
  }
};

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} [${process.env['NODE_ENV'] ?? 'development'}]`);
  console.log(`CORS origins: ${corsOptions.origin}`);
  logger.info(`Server running on port ${PORT} [${process.env['NODE_ENV'] ?? 'development'}]`);
  logger.info(`CORS origins: ${corsOptions.origin}`);
  initializeServices();
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
    logger.info('Process terminated');
    process.exit(0);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default app;
