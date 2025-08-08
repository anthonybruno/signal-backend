import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { chatRateLimit } from '@/middleware/rateLimit';
import { validateChatMessage } from '@/middleware/validation';
import {
  OrchestrationService,
  type ChatResponse,
} from '@/services/orchestrationService';
import type { MCPDirectResponse } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

const router = Router();
const orchestrationService = new OrchestrationService();

/**
 * Check if response is a direct MCP response
 */
function isMCPDirectResponse(
  result: ChatResponse,
): result is MCPDirectResponse {
  return 'type' in result;
}

/**
 * Validation schema for chat requests
 */
const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, MESSAGES.validation.messageEmpty)
    .max(1000, MESSAGES.validation.messageTooLong),
  conversationHistory: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant'], {
          errorMap: () => ({ message: MESSAGES.validation.invalidRole }),
        }),
        content: z.string(),
      }),
    )
    .optional()
    .default([]),
});

/**
 * Sets up SSE headers for streaming response
 */
function setupStreamingHeaders(res: Response): void {
  res.writeHead(200, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control',
  });
}

/**
 * Sends a streaming message to the client
 */
function sendStreamMessage(res: Response, type: string, data: unknown): void {
  res.write(`${JSON.stringify({ type, data })}\n`);
}

/**
 * Streaming chat endpoint
 */
router.post(
  '/',
  chatRateLimit,
  validateChatMessage,
  async (req: Request, res: Response) => {
    try {
      const validatedData = chatRequestSchema.parse(req.body);
      setupStreamingHeaders(res);

      let content = '';
      let mcpTool: string | undefined;

      const result = await orchestrationService.generateStreamingResponse(
        validatedData,
        (chunk: string) => {
          sendStreamMessage(res, 'chunk', chunk);
          content += chunk;
        },
        (tool: string) => {
          mcpTool = tool;
          sendStreamMessage(res, 'tools_starting', { tool });
        },
      );

      if (isMCPDirectResponse(result)) {
        mcpTool = result.mcp_tool;
      }

      sendStreamMessage(res, 'done', {
        content,
        mcp_tool: mcpTool,
      });

      res.end();
    } catch (error) {
      logger.error('Streaming chat error:', error);
      sendStreamMessage(res, 'error', { message: MESSAGES.api.failedResponse });
      res.end();
    }
  },
);

export { router };
