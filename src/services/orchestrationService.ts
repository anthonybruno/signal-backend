import type { ChatRequest } from '@/types';
import { logger } from '@/utils/logger';
import { formatRoutingPrompt } from '@/utils/prompts';

import { LLMService, type IntentDecision } from './llmService';
import { MCPResponseService } from './mcpResponseService';
import { RAGService } from './ragService';

export class OrchestrationService {
  private readonly llmService = new LLMService();
  private readonly ragService = new RAGService();
  private readonly mcpResponseService = new MCPResponseService();

  // Main entry point
  async handleChatRequest(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    const { message } = request;
    const routing = await this.analyzeIntent(message);

    if (routing.mcpTool) {
      await this.mcpResponseService.executeMCPFlow(
        request,
        [routing.mcpTool],
        onChunk,
        onToolsStarting,
      );
    } else if (routing.useRAG) {
      await this.ragService.executeRAGFlow(
        request,
        onChunk,
        this.llmService,
        this.llmService.executeDirectLLMFlow.bind(this.llmService),
      );
    } else {
      await this.llmService.executeDirectLLMFlow(request, onChunk);
    }
  }

  // Intent analysis
  private async analyzeIntent(message: string): Promise<IntentDecision> {
    try {
      const routingPrompt = formatRoutingPrompt(message);
      return await this.llmService.analyzeIntent(routingPrompt);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error(
        `Intent analysis failed: ${errorMessage}, defaulting to RAG`,
      );

      return {
        useRAG: true,
        mcpTool: '',
        reasoning: 'Intent analysis failed, defaulting to RAG for safety',
      };
    }
  }
}
