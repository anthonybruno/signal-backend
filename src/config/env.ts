import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env file
dotenv.config();

const envSchema = z.object({
  ALLOWED_ORIGINS: z.string().min(1),
  CHAT_HISTORY_LIMIT: z.coerce.number().min(1),
  CHROMA_COLLECTION: z.string().min(1),
  CHROMA_HOST: z.string().min(1),
  CHROMA_PORT: z.coerce.number().min(1),
  COHERE_API_KEY: z.string().min(1),
  DEFAULT_MODEL: z.string().min(1),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  MCP_SERVER_URL: z.string().min(1),
  MCP_TRANSPORT: z.enum(['stdio', 'http']).default('http'),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  PORT: z.coerce.number().min(1),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().min(1),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().min(1),
  RETRIEVAL_MIDDLE_CUTOFF: z.coerce.number().min(0).max(1),
  RETRIEVAL_MIDDLE_TOP_K: z.coerce.number().min(1),
  RETRIEVAL_STRONG_CUTOFF: z.coerce.number().min(0).max(1),
  RETRIEVAL_STRONG_TOP_K: z.coerce.number().min(1),
  RETRIEVAL_WEAK_CUTOFF: z.coerce.number().min(0).max(1),
  RETRIEVAL_WEAK_TOP_K: z.coerce.number().min(1),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function getEnv(): EnvConfig {
  return envSchema.parse(process.env);
}
