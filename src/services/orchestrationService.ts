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
      const messages = createMessages(request, {
        ragContext: await this.ragService.findRelevantContext(
          request.message,
          5,
        ),
      });

      const response = await this.llmService.generateResponse(
        request,
        onChunk,
        messages,
      );

      if (response.toolCalls?.[0]) {
        await this.handleToolCall(
          response.toolCalls[0],
          onChunk,
          onToolsStarting,
        );
      }
    } catch (error) {
      logger.error('Chat request failed:', error);
      onChunk(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  private async handleToolCall(
    toolCall: ToolCall,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const toolName = toolCall.function.name;

    try {
      if (onToolsStarting) onToolsStarting(toolName);

      const response = await this.mcpResponseService.createDirectResponse([
        {
          name: toolName,
          arguments: {},
        },
      ]);

      await this.streamResponse(response.formatted, onChunk);
    } catch (error) {
      logger.error(`Tool execution failed for ${toolName}:`, error);
      onChunk(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  private async streamResponse(
    response: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    for (const char of response) {
      onChunk(char);
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
  }
}
