import type { ChatRequest } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';
import { createMessages } from '@/utils/prompts';

import { LLMService, type ToolCall } from './llmService';
import { MCPResponseService } from './mcpResponseService';
import { RAGService } from './ragService';

export class OrchestrationService {
  private readonly llmService = new LLMService();
  private readonly ragService = new RAGService();
  private readonly mcpResponseService = new MCPResponseService();

  async handleChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    try {
      const response = await this.llmService.generateResponseWithTools(
        request,
        onChunk,
      );

      if (response.toolCalls && response.toolCalls.length > 0) {
        await this.executeToolCalls(
          response.toolCalls,
          request,
          onChunk,
          onToolsStarting,
        );
      }
    } catch (error) {
      logger.error('Chat request failed:', error);
      onChunk(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  private async executeToolCalls(
    toolCalls: ToolCall[],
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const [toolCall] = toolCalls;
    const toolName = toolCall.function.name;

    try {
      let toolResult: string;

      if (toolName === 'use_rag') {
        toolResult = await this.executeRAGTool(request);
        await this.generateFinalResponse(request, toolResult, onChunk);
      } else if (
        [
          'get_current_spotify_track',
          'get_github_activity',
          'get_latest_blog_post',
          'get_project_info',
        ].includes(toolName)
      ) {
        toolResult = await this.executeMCPTool(
          toolName,
          request,
          onToolsStarting,
        );
        await this.streamFormattedResponse(toolResult, onChunk);
      } else {
        logger.warn(`Unknown tool: ${toolName}`);
        onChunk(MESSAGES.llm.streamingFailedGeneral);
        return;
      }
    } catch (error) {
      logger.error(`Tool execution failed for ${toolName}:`, error);
      onChunk(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  private async executeRAGTool(request: ChatRequest): Promise<string> {
    const context = await this.ragService.getContextForTool(request.message);
    return context;
  }

  private async executeMCPTool(
    toolName: string,
    request: ChatRequest,
    onToolsStarting?: (tool: string) => void,
  ): Promise<string> {
    if (onToolsStarting) {
      onToolsStarting(toolName);
    }

    const toolCalls = [{ name: toolName, arguments: {} }];
    const response =
      await this.mcpResponseService.createDirectResponse(toolCalls);
    return response.formatted;
  }

  private async generateFinalResponse(
    request: ChatRequest,
    toolResult: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const messages = createMessages(request, { toolResult });

    try {
      await this.llmService.streamResponse(messages, { onChunk });
    } catch (error) {
      logger.error('Final response generation failed:', error);
      onChunk(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  private async streamFormattedResponse(
    formattedResponse: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    for (const char of formattedResponse) {
      onChunk(char);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}
