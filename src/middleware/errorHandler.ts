import { Request, Response, NextFunction } from 'express';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';
import { AppError } from '@/types';

export class ApiError extends Error implements AppError {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode: number = 500, isOperational: boolean = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = 'ApiError';

    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (err: AppError, req: Request, res: Response): void => {
  const { statusCode = 500, message, stack } = err;

  // Log error details
  logger.error('Error caught by global handler', {
    error: message,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
    stack: process.env['NODE_ENV'] === 'development' ? stack : undefined,
  });

  // Don't leak error details in production
  const isDevelopment = process.env['NODE_ENV'] === 'development';

  const errorResponse = {
    success: false,
    error: statusCode === 500 && !isDevelopment ? MESSAGES.error.internalServer : message,
    ...(isDevelopment && {
      stack,
      timestamp: new Date().toISOString(),
      path: req.path,
    }),
  };

  res.status(statusCode).json(errorResponse);
};

// Type for async route handlers
type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

// Async error wrapper to catch promise rejections
export const asyncHandler = <T extends AsyncRouteHandler>(fn: T) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
