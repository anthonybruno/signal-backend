import {
  RAG_SYSTEM_PROMPT,
  MCP_SYSTEM_PROMPT,
  DIRECT_LLM_SYSTEM_PROMPT,
  formatRoutingPrompt,
} from '@/prompts';
import { mcpClient } from '@/services/mcpClientService';
import { mcpResponseService } from '@/services/mcpResponseService';
import type {
  ChatRequest as SharedChatRequest,
  MCPToolCall,
  ChatMessage,
} from '@/types';
import { logger } from '@/utils/logger';

import { EmbeddingService } from './embeddingService';
import { LLMService } from './llmService';

export interface ChatRequest extends SharedChatRequest {
  conversationHistory?: ChatMessage[];
}

interface SmartRoutingDecision {
  useRAG: boolean;
  mcpTool: string;
  directResponse: boolean;
  confidence: number;
  reasoning: string;
}

export class OrchestrationService {
  private embeddingService: EmbeddingService;
  private llmService: LLMService;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.llmService = new LLMService();
  }

  /**
   * Use LLM to intelligently determine routing for RAG, MCP tools, and response type
   */
  private async smartRouting(
    message: string,
    conversationHistory: ChatMessage[] = [],
  ): Promise<SmartRoutingDecision> {
    // Format recent conversation context if available
    const recentContext = conversationHistory
      .slice(-3) // Last 3 messages for context
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n');

    const routingPrompt = formatRoutingPrompt(message, recentContext);

    try {
      logger.info('Using LLM for smart routing decision');

      const response = await this.llmService.generateResponse(
        [{ role: 'user', content: routingPrompt }],
        {
          maxTokens: 200,
        },
      );

      // Parse the JSON response (handle markdown code blocks)
      let jsonText = response.message.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const decision: SmartRoutingDecision = JSON.parse(jsonText);

      logger.info(
        `RAG routing decision: ${decision.useRAG} (confidence: ${decision.confidence})`,
        {
          reasoning: decision.reasoning,
          query:
            message.substring(0, 100) + (message.length > 100 ? '...' : ''),
        },
      );

      return decision;
    } catch (error) {
      // Simple error logging without circular references
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `RAG routing failed: ${errorMsg}. Defaulting to safe fallback.`,
      );

      // Fallback: use RAG for safety, but with low confidence
      return {
        useRAG: true,
        mcpTool: '',
        directResponse: false,
        confidence: 0.5,
        reasoning: 'Routing failed, defaulting to RAG for safety',
      };
    }
  }

  /**
   * Call MCP tools and format results for LLM context
   */
  private async getMCPToolData(toolCalls: MCPToolCall[]): Promise<string[]> {
    const toolResults: string[] = [];

    for (const toolCall of toolCalls) {
      try {
        logger.info(`Calling MCP tool: ${toolCall.name}`);
        const result = await mcpClient.callTool(toolCall);

        logger.info(`MCP tool ${toolCall.name} response:`, {
          isError: result.isError,
          contentLength: result.content.length,
          firstContentType: result.content[0]?.type,
          firstContentText: `${result.content[0]?.text?.substring(0, 200)}...`,
        });

        if (!result.isError && result.content.length > 0) {
          // Extract text content from MCP tool response
          const textContent = result.content
            .filter((item) => item.type === 'text')
            .map((item) => item.text)
            .join(' ');

          if (textContent) {
            toolResults.push(`[${toolCall.name}]: ${textContent}`);
          }
        }
      } catch (error) {
        logger.error(`Error calling MCP tool ${toolCall.name}:`, error);
        toolResults.push(`[${toolCall.name}]: Error - Tool unavailable`);
      }
    }

    return toolResults;
  }

  /**
   * Generate streaming response
   */
  async generateStreamingResponse(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const { message, conversationHistory = [] } = request;

    // Use smart routing to determine approach
    const routing = await this.smartRouting(message, conversationHistory);

    if (routing.directResponse && routing.mcpTool) {
      // Direct MCP tool response WITH streaming
      await this.executeDirectMCPFlow(
        request,
        [routing.mcpTool],
        onChunk,
        onToolsStarting,
      );
    } else if (routing.useRAG) {
      // RAG-based response WITH streaming
      await this.executeRAGFlow(request, onChunk);
    } else if (routing.mcpTool) {
      // MCP tools with LLM processing and streaming
      await this.executeMCPFlow(
        request,
        [routing.mcpTool],
        onChunk,
        onToolsStarting,
      );
    } else {
      // Direct LLM response WITH streaming
      await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute RAG flow with streaming
   */
  private async executeRAGFlow(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const { message, conversationHistory = [] } = request;

    try {
      // Search for relevant context
      const searchResults = await this.embeddingService.searchSimilar(
        message,
        3,
      );
      const retrievedChunks = searchResults.results.map(
        (result) => result.content,
      );

      if (retrievedChunks.length === 0) {
        logger.warn(
          'No RAG context found, falling back to direct LLM response',
        );
        await this.executeDirectLLMFlow(request, onChunk);
        return;
      }

      // Build context from retrieved chunks
      const context = retrievedChunks.join('\n\n');
      const contextMessage = `Context about Anthony Bruno:\n${context}\n\nUser question: ${message}`;

      // Prepare conversation with context
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: RAG_SYSTEM_PROMPT,
        },
        ...conversationHistory,
        { role: 'user', content: contextMessage },
      ];

      // Generate streaming response
      await this.llmService.generateStreamingResponse(messages, {
        maxTokens: 1000,
        onChunk,
      });
    } catch (error) {
      logger.error('RAG flow failed:', error);
      // Fallback to direct LLM response
      await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute MCP tool calls with LLM processing and streaming
   */
  private async executeMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const { message, conversationHistory = [] } = request;

    try {
      // Notify that tools are starting (use first tool since we only support one at a time)
      onToolsStarting?.(toolNames[0]);

      // Create tool calls
      const toolCalls: MCPToolCall[] = toolNames.map((name) => ({
        name,
        arguments: {},
      }));

      // Get tool data
      const toolResults = await this.getMCPToolData(toolCalls);
      const toolContext = toolResults.join('\n\n');

      // Build context with tool results
      const contextMessage = `Live data from tools:\n${toolContext}\n\nUser question: ${message}`;

      // Prepare conversation with tool context
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: MCP_SYSTEM_PROMPT,
        },
        ...conversationHistory,
        { role: 'user', content: contextMessage },
      ];

      // Generate streaming response
      await this.llmService.generateStreamingResponse(messages, {
        maxTokens: 1000,
        onChunk,
      });
    } catch (error) {
      logger.error('MCP flow failed:', error);
      // Fallback to direct LLM response
      await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute direct MCP tool calls with streaming
   */
  private async executeDirectMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    try {
      // Notify about tools starting
      onToolsStarting?.(toolNames[0]);

      // Create tool calls
      const toolCalls: MCPToolCall[] = toolNames.map((name) => ({
        name,
        arguments: {},
      }));

      // Format response for direct tool calls
      const response = await mcpResponseService.formatDirectResponse(toolCalls);

      // Stream the formatted response
      const { formatted } = response;
      const words = formatted.split(/(\s+)/);
      for (const word of words) {
        if (word) {
          onChunk(word);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
    } catch (error) {
      logger.error('Direct MCP flow failed:', error);
      throw new Error('Failed to execute MCP tools');
    }
  }

  /**
   * Execute direct LLM response with streaming
   */
  private async executeDirectLLMFlow(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const { message, conversationHistory = [] } = request;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: DIRECT_LLM_SYSTEM_PROMPT,
      },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    await this.llmService.generateStreamingResponse(messages, {
      maxTokens: 1000,
      onChunk,
    });
  }
}
