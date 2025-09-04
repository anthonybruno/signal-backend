import rateLimit from 'express-rate-limit';

import { getEnv } from '@/config/env';

/**
 * Creates a rate limiter middleware with configurable settings
 */
export function createRateLimiter() {
  const env = getEnv();

  return rateLimit({
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    max: env.RATE_LIMIT_MAX_REQUESTS,
    message: {
      error: 'Rate limit exceeded. Please wait before sending another message.',
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}
