import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

import { initializeChromaDB } from '@/config/database';
import { router as chatRoutes } from '@/routes/chat';
import { logger } from '@/utils/logger';

dotenv.config();

const app = express();
const PORT = process.env['PORT'] ?? 3000;

// Security middleware
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env['ALLOWED_ORIGINS']?.split(',') ?? [
    'http://localhost:3000',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000'), // 1 minute (more appropriate for chat)
  max: parseInt(process.env['RATE_LIMIT_MAX_REQUESTS'] ?? '20'), // 20 requests per minute (more restrictive for chat)
  message: {
    error: 'Rate limit exceeded. Please wait before sending another message.',
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

// Health check route
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/chat', chatRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
  });
});

// SIMPLIFIED: Just initialize ChromaDB connection (no embedding generation)
const initializeServices = async () => {
  try {
    await initializeChromaDB();
    logger.info('ChromaDB connection established');
  } catch (error) {
    logger.error(
      'Backend degraded: ChromaDB connection failed. RAG features will be disabled.',
    );
    if (process.env.LOG_LEVEL === 'debug') {
      logger.error(error);
    }
  }
};

const server = app.listen(PORT, () => {
  logger.info(`Backend started on port ${PORT}`);
});

// Initialize services after server starts
initializeServices().catch((error) => {
  console.error('Failed to initialize services:', error);
  logger.error('Failed to initialize services:', error);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(() => {
    console.log('Process terminated');
    process.exit(0);
  });
});
