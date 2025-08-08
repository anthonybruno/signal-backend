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

    const routingPrompt = `You are a smart router for Anthony Bruno's AI assistant (frontend developer and engineering manager).

Analyze this query and determine:
1. Does it need RAG context (Anthony's personal/professional knowledge)?
2. Does it need live data from MCP tools?
3. Should it bypass the main LLM for a direct tool response?

Current query: "${message}"

${recentContext ? `Recent conversation context:\n${recentContext}\n` : ''}

RAG Knowledge Base contains:
- **experience.md**: Anthony's professional experience and career background, work history, and career progression
- **skills.md**: Technical skills (React, TypeScript, JavaScript, frontend development, leadership, management)
- **projects.md**: Past projects, achievements, and detailed project descriptions
- **interests.md**: Personal interests, hobbies, and what Anthony enjoys outside of work
- **values.md**: Personal values, principles, and what Anthony believes in
- **faq.md**: Frequently asked questions and common topics about Anthony
- **quotes.md**: Favorite quotes and sayings that inspire Anthony
- **links.md**: Important links, resources, and references

Available MCP Tools:
- get_current_spotify_track: Get what Anthony is currently listening to on Spotify
- get_github_activity: Get recent GitHub activity and profile information
- get_latest_blog_post: Get the latest blog post(s) from Anthony's blog
- get_project_info: Get information about this project

Routing Rules:
- RAG and MCP are MUTUALLY EXCLUSIVE - never use both
- Use MCP tools for current/live data requests
- Use RAG for historical/personal knowledge requests
- Use directResponse=true ONLY for simple, direct requests for current data (e.g., "What are you listening to?", "What's playing?", "Show me your GitHub activity", "Show me your latest blog post")
- Use directResponse=false but mcpTools populated when live data needs LLM processing
- Use RAG=true when asking about Anthony's background, experience, or personal information
- Use RAG=false for general questions not about Anthony

Respond ONLY with valid JSON:
{
  "useRAG": true/false,
  "mcpTool": "tool_name" or "",
  "directResponse": true/false,
  "confidence": 0.95,
  "reasoning": "brief explanation"
}

Examples:
- "What's your React experience?" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about technical skills from skills.md"}
- "What are your values?" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal values from values.md"}
- "What projects have you worked on?" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about past projects from projects.md"}
- "What are your interests?" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal interests from interests.md"}
- "What are you listening to?" -> {"useRAG": false, "mcpTool": "get_current_spotify_track", "directResponse": true, "confidence": 0.98, "reasoning": "direct request for current music"}
- "How do I learn React?" -> {"useRAG": false, "mcpTool": "", "directResponse": false, "confidence": 0.92, "reasoning": "general advice, not about Anthony"}
- "Show me your GitHub activity" -> {"useRAG": false, "mcpTool": "get_github_activity", "directResponse": true, "confidence": 0.98, "reasoning": "direct request for GitHub activity"}
- "What have you been working on lately?" -> {"useRAG": false, "mcpTool": "get_github_activity", "directResponse": false, "confidence": 0.95, "reasoning": "asking about recent work activity"}
- "Show me your latest blog post" -> {"useRAG": false, "mcpTool": "get_latest_blog_post", "directResponse": true, "confidence": 0.98, "reasoning": "direct request for latest blog post"}
- "What are your most recent articles?" -> {"useRAG": false, "mcpTool": "get_latest_blog_post", "directResponse": true, "confidence": 0.98, "reasoning": "direct request for recent blog articles"}
- "Tell me about your blog" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about the blog in general, not for live data"}
- "Tell me about this project" -> {"useRAG": false, "mcpTool": "get_project_info", "directResponse": true, "confidence": 0.98, "reasoning": "direct request for project info"}
- "What do you believe in?" -> {"useRAG": true, "mcpTool": "", "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal values from values.md"}
`;

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
   * Unified RAG execution that handles both streaming and non-streaming
   */
  private async executeRAGFlow(
    request: ChatRequest,
    onChunk?: (chunk: string) => void,
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
          content:
            'You are Anthony Bruno, a frontend developer and engineering manager. Use the provided context to answer questions about yourself, your experience, and your background. Be conversational and authentic.',
        },
        ...conversationHistory,
        { role: 'user', content: contextMessage },
      ];

      // Generate response - streaming or non-streaming based on callback presence
      if (onChunk) {
        await this.llmService.generateStreamingResponse(messages, {
          maxTokens: 1000,
          onChunk,
        });
      } else {
        await this.llmService.generateResponse(messages, {
          maxTokens: 1000,
        });
      }
    } catch (error) {
      logger.error('RAG flow failed:', error);
      // Fallback to direct LLM response
      await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute MCP tool calls with LLM processing
   */
  private async executeMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk?: (chunk: string) => void,
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
          content:
            'You are Anthony Bruno, a frontend developer and engineering manager. Use the provided live data from tools to answer questions about current information.',
        },
        ...conversationHistory,
        { role: 'user', content: contextMessage },
      ];

      // Generate response - streaming or non-streaming based on callback presence
      if (onChunk) {
        await this.llmService.generateStreamingResponse(messages, {
          maxTokens: 1000,
          onChunk,
        });
      } else {
        await this.llmService.generateResponse(messages, {
          maxTokens: 1000,
        });
      }
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
    onChunk?: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    try {
      // Notify about tools starting (only for streaming requests)
      if (onChunk && onToolsStarting) {
        onToolsStarting(toolNames[0]);
      }

      // Create tool calls
      const toolCalls: MCPToolCall[] = toolNames.map((name) => ({
        name,
        arguments: {},
      }));

      // Format response for direct tool calls
      const response = await mcpResponseService.formatDirectResponse(toolCalls);

      // Stream the formatted response if needed
      if (onChunk) {
        const { formatted } = response;
        const words = formatted.split(/(\s+)/);
        for (const word of words) {
          if (word) {
            onChunk(word);
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
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
    onChunk?: (chunk: string) => void,
  ): Promise<void> {
    const { message, conversationHistory = [] } = request;

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'You are Anthony Bruno, a frontend developer and engineering manager. Answer questions naturally and helpfully.',
      },
      ...conversationHistory,
      { role: 'user', content: message },
    ];

    if (onChunk) {
      await this.llmService.generateStreamingResponse(messages, {
        maxTokens: 1000,
        onChunk,
      });
    } else {
      await this.llmService.generateResponse(messages, {
        maxTokens: 1000,
      });
    }
  }
}
