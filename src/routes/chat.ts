import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { validateChatMessage } from '@/middleware/validation';
import { OrchestrationService } from '@/services/orchestrationService';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

const router = Router();
const orchestrationService = new OrchestrationService();

/**
 * Validation schema for chat requests
 */
const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, MESSAGES.validation.messageEmpty)
    .max(1000, MESSAGES.validation.messageTooLong),
  history: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant', 'system']),
        content: z.string(),
      }),
    )
    .optional(),
});

/**
 * Streaming chat endpoint
 */
router.post('/', validateChatMessage, async (req: Request, res: Response) => {
  try {
    const validatedData = chatRequestSchema.parse(req.body);

    // Setup streaming headers
    res.writeHead(200, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    await orchestrationService.handleChatRequest(
      validatedData,
      (chunk: string) => {
        res.write(`${JSON.stringify({ type: 'chunk', data: chunk })}\n`);
      },
      (tool: string) => {
        res.write(
          `${JSON.stringify({ type: 'tools_starting', data: { tool } })}\n`,
        );
      },
    );

    res.write(`${JSON.stringify({ type: 'done' })}\n`);
    res.end();
  } catch (error) {
    logger.error('Chat streaming error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestBody: req.body,
    });

    res.write(
      `${JSON.stringify({
        type: 'error',
        data: { message: MESSAGES.api.failedResponse },
      })}\n`,
    );
    res.end();
  }
});

export { router };
