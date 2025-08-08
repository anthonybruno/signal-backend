import rateLimit from 'express-rate-limit';

export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Rate limit exceeded. Please wait before sending another message.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
