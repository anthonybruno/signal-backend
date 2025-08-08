import {
  RAG_SYSTEM_PROMPT,
  DIRECT_LLM_SYSTEM_PROMPT,
  formatRoutingPrompt,
} from '@/prompts';
import { mcpResponseService } from '@/services/mcpResponseService';
import type {
  ChatRequest as SharedChatRequest,
  MCPToolCall,
  ChatMessage,
} from '@/types';
import { logger } from '@/utils/logger';

import { EmbeddingService } from './embeddingService';
import { LLMService, type IntentDecision } from './llmService';

export interface ChatRequest extends SharedChatRequest {
  conversationHistory?: ChatMessage[];
}

export class OrchestrationService {
  private embeddingService: EmbeddingService;
  private llmService: LLMService;

  constructor() {
    this.embeddingService = new EmbeddingService();
    this.llmService = new LLMService();
  }

  /**
   * Analyze user intent and determine which service should handle the request
   */
  private async analyzeIntent(message: string): Promise<IntentDecision> {
    const routingPrompt = formatRoutingPrompt(message);

    try {
      const decision = await this.llmService.intentDispatcher(routingPrompt);

      return decision;
    } catch (error) {
      // Simple error logging without circular references
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `Intent analysis failed: ${errorMsg}. Defaulting to safe fallback.`,
      );

      // Fallback: use RAG for safety, but with low confidence
      return {
        useRAG: true,
        mcpTool: '',
        reasoning: 'Intent analysis failed, defaulting to RAG for safety',
      };
    }
  }

  /**
   * Generate streaming response
   */
  async generateStreamingResponse(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const { message } = request;

    // Analyze user intent to determine approach
    const routing = await this.analyzeIntent(message);

    if (routing.mcpTool) {
      // MCP tool response WITH streaming
      await this.executeDirectMCPFlow(
        request,
        [routing.mcpTool],
        onChunk,
        onToolsStarting,
      );
    } else if (routing.useRAG) {
      // RAG-based response WITH streaming
      await this.executeRAGFlow(request, onChunk);
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
