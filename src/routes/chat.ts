import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler, ApiError } from '@/middleware/errorHandler';
import { validateChatMessage, sanitizeInput } from '@/middleware/validation';
import { logger } from '@/utils/logger';
import { mcpClient } from '@/services/mcpClientService';
import { RAGService, ChatResponse } from '@/services/ragService';
import { MCPDirectResponse } from '@/types';
import { MESSAGES } from '@/utils/messages';

const router = Router();

// Initialize RAG service
const ragService = new RAGService();

// Type guards
function isMCPDirectResponse(result: ChatResponse): result is MCPDirectResponse {
  return 'type' in result && result.type === 'mcp_direct';
}

// Request validation schema
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
  model: z.string().optional(),
  temperature: z
    .number()
    .min(0, { message: MESSAGES.validation.invalidTemperature })
    .max(2, { message: MESSAGES.validation.invalidTemperature })
    .optional(),
});

// Regular chat endpoint
router.post(
  '/',
  validateChatMessage,
  asyncHandler(async (req: Request, res: Response) => {
    // Validate request
    const validatedData = chatRequestSchema.parse(req.body);

    // Sanitize the message
    validatedData.message = sanitizeInput(validatedData.message);

    try {
      // Generate response using RAG or direct MCP
      const result = await ragService.generateResponse(validatedData);

      // Handle different response types
      if (isMCPDirectResponse(result)) {
        // Direct MCP response
        res.json({
          success: true,
          data: {
            type: 'mcp_direct',
            message: result.formatted,
            service: result.service,
            data: result.data,
            metadata: {
              ...result.metadata,
              responseType: 'mcp_direct',
            },
          },
        });
      } else {
        // Regular RAG response
        res.json({
          success: true,
          data: {
            type: 'rag_response',
            message: result.response,
            model: result.model,
            contextUsed: result.contextUsed,
            metadata: {
              timestamp: new Date().toISOString(),
              usage: result.usage,
              responseType: 'rag_response',
            },
          },
        });
      }
    } catch {
      throw new ApiError(MESSAGES.api.failedChat, 500);
    }
  }),
);

// Streaming chat endpoint
router.post(
  '/stream',
  validateChatMessage,
  asyncHandler(async (req: Request, res: Response) => {
    // Validate request
    const validatedData = chatRequestSchema.parse(req.body);

    // Sanitize the message
    validatedData.message = sanitizeInput(validatedData.message);

    try {
      // Set up Server-Sent Events headers
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Cache-Control',
      });

      let fullResponse = '';
      let toolsUsed: string[] = [];
      let responseType = 'rag_response';

      // Generate streaming response
      const result = await ragService.generateStreamingResponse(
        validatedData,
        (chunk: string) => {
          // Send each chunk as it arrives
          res.write(`${JSON.stringify({ type: 'chunk', data: chunk })}\n`);
          fullResponse += chunk;
        },
        (tools: string[]) => {
          // Send tool notification
          toolsUsed = tools;
          res.write(
            `${JSON.stringify({
              type: 'tools_starting',
              data: { tools },
            })}\n`,
          );
        },
      );

      // Determine response type and metadata
      if (isMCPDirectResponse(result)) {
        responseType = 'mcp_direct';
        toolsUsed = result.metadata.tools;
      }

      // Send completion signal
      res.write(
        `${JSON.stringify({
          type: 'done',
          data: {
            fullResponse,
            responseType,
            metadata: {
              ...(isMCPDirectResponse(result)
                ? result.metadata
                : {
                    model: result.model,
                    contextUsed: result.contextUsed,
                    toolsUsed,
                    usage: result.usage,
                    timestamp: new Date().toISOString(),
                  }),
            },
          },
        })}\n`,
      );

      res.end();
    } catch (error) {
      logger.error('Streaming chat error:', error);
      res.write(
        `${JSON.stringify({
          type: 'error',
          data: { message: MESSAGES.api.failedResponse },
        })}\n`,
      );
      res.end();
    }
  }),
);

// Test endpoint for RAG system
router.get(
  '/test',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      res.json({
        success: true,
        message: 'RAG system endpoints are ready',
      });
    } catch {
      throw new ApiError(MESSAGES.rag.systemTestFailed, 500);
    }
  }),
);

// Test MCP
router.get(
  '/test-mcp',
  asyncHandler(async (_req: Request, res: Response) => {
    try {
      logger.info('Testing MCP connection...');

      // Test 1: List available tools
      const tools = await mcpClient.listTools();
      logger.info('Available MCP tools:', tools);

      // Test 2: Call the Spotify tool
      const spotifyResult = await mcpClient.callTool({
        name: 'get_current_spotify_track',
      });

      // Test 3: Call the GitHub tool
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
        error: error instanceof Error ? error.message : MESSAGES.api.mcpTestFailed,
      });
    }
  }),
);

export default router;
