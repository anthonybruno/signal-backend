import { Router, type Request, type Response } from 'express';
import { z } from 'zod';

import { chatRateLimit } from '@/middleware/rateLimit';
import { validateChatMessage } from '@/middleware/validation';
import { mcpClient } from '@/services/mcpClientService';
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
  '/stream',
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

/**
 * Test endpoint for RAG system
 */
router.get('/test', (_req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'RAG system endpoints are ready',
  });
});

/**
 * Test MCP connection and tools
 */
router.get('/test-mcp', async (_req: Request, res: Response) => {
  try {
    logger.info('Testing MCP connection...');

    const tools = await mcpClient.listTools();
    logger.info('Available MCP tools:', tools);

    const spotifyResult = await mcpClient.callTool({
      name: 'get_current_spotify_track',
    });

    const githubResult = await mcpClient.callTool({
      name: 'get_github_activity',
      arguments: { days: 7 },
    });

    res.json({
      success: true,
      data: {
        availableTools: tools,
        spotifyTest: spotifyResult,
        githubTest: githubResult,
      },
    });
  } catch (error) {
    logger.error('MCP test failed:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error ? error.message : MESSAGES.api.mcpTestFailed,
    });
  }
});

export { router };
