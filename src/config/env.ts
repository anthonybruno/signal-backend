import { z } from 'zod';
import dotenv from 'dotenv';

// Load .env file
dotenv.config();

const envSchema = z.object({
  // Required (no defaults - must be set)
  OPENROUTER_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  DEFAULT_MODEL: z.string().min(1),
  RAG_ROUTING_MODEL: z.string().min(1),

  // Optional with simple defaults
  PORT: z.string().default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CHROMA_HOST: z.string().default('localhost'),
  CHROMA_PORT: z.string().default('8000').transform(Number),
  MCP_SERVER_URL: z.string().default('http://localhost:3001'),
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type EnvConfig = z.infer<typeof envSchema>;

export function getEnv(): EnvConfig {
  return envSchema.parse(process.env);
}
