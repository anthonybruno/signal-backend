import { EmbeddingService } from './embeddingService';
import { LLMService } from './llmService';
import { mcpClient } from '@/services/mcpClientService';
import { logger } from '@/utils/logger';
import { getEnv } from '@/config/env';
import { mcpResponseService } from '@/services/mcpResponseService';
import {
  ChatRequest as SharedChatRequest,
  MCPToolCall,
  ChatMessage,
  MCPDirectResponse,
} from '@/types';

export interface ChatRequest extends SharedChatRequest {
  conversationHistory?: ChatMessage[];
  model?: string;
  temperature?: number;
}

export interface ChatWithRAGResponse {
  response: string;
  model: string;
  contextUsed: boolean;
  retrievedChunks: string[] | undefined;
  usage:
    | {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      }
    | undefined;
}

export type ChatResponse = ChatWithRAGResponse | MCPDirectResponse;

interface SmartRoutingDecision {
  useRAG: boolean;
  mcpTools: string[];
  directResponse: boolean;
  confidence: number;
  reasoning: string;
}

export class RAGService {
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
  "mcpTools": ["tool_name"] or [],
  "directResponse": true/false,
  "confidence": 0.95,
  "reasoning": "brief explanation"
}

Examples:
- "What's your React experience?" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about technical skills from skills.md"}
- "What are your values?" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal values from values.md"}
- "What projects have you worked on?" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about past projects from projects.md"}
- "What are your interests?" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal interests from interests.md"}
- "What are you listening to?" -> {"useRAG": false, "mcpTools": ["get_current_spotify_track"], "directResponse": true, "confidence": 0.98, "reasoning": "direct request for current music"}
- "How do I learn React?" -> {"useRAG": false, "mcpTools": [], "directResponse": false, "confidence": 0.92, "reasoning": "general advice, not about Anthony"}
- "Show me your GitHub activity" -> {"useRAG": false, "mcpTools": ["get_github_activity"], "directResponse": true, "confidence": 0.98, "reasoning": "direct request for GitHub activity"}
- "What have you been working on lately?" -> {"useRAG": false, "mcpTools": ["get_github_activity"], "directResponse": false, "confidence": 0.95, "reasoning": "asking about recent work activity"}
- "Show me your latest blog post" -> {"useRAG": false, "mcpTools": ["get_latest_blog_post"], "directResponse": true, "confidence": 0.98, "reasoning": "direct request for latest blog post"}
- "What are your most recent articles?" -> {"useRAG": false, "mcpTools": ["get_latest_blog_post"], "directResponse": true, "confidence": 0.98, "reasoning": "direct request for recent blog articles"}
- "Tell me about your blog" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about the blog in general, not for live data"}
- "Tell me about this project" -> {"useRAG": false, "mcpTools": ["get_project_info"], "directResponse": true, "confidence": 0.98, "reasoning": "direct request for project info"}
- "What do you believe in?" -> {"useRAG": true, "mcpTools": [], "directResponse": false, "confidence": 0.95, "reasoning": "asking about personal values from values.md"}
`;

    try {
      logger.info('Using LLM for smart routing decision');

      const env = getEnv();
      const response = await this.llmService.generateResponse(
        [{ role: 'user', content: routingPrompt }],
        {
          model: env.RAG_ROUTING_MODEL, // Fast and cheap for routing
          temperature: 0.1, // Low temperature for consistent classification
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

      logger.info(`RAG routing decision: ${decision.useRAG} (confidence: ${decision.confidence})`, {
        reasoning: decision.reasoning,
        query: message.substring(0, 100) + (message.length > 100 ? '...' : ''),
      });

      return decision;
    } catch (error) {
      // Simple error logging without circular references
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`RAG routing failed: ${errorMsg}. Defaulting to safe fallback.`);

      // Fallback: use RAG for safety, but with low confidence
      return {
        useRAG: true,
        mcpTools: [],
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
   * Generate response using RAG, MCP tools, or direct LLM
   */
  async generateResponse(request: ChatRequest): Promise<ChatResponse> {
    const { message, conversationHistory = [] } = request;

    // Use smart routing to determine approach
    const routing = await this.smartRouting(message, conversationHistory);

    if (routing.directResponse && routing.mcpTools.length > 0) {
      // Direct MCP tool response
      return await this.executeDirectMCPFlow(request, routing.mcpTools);
    } else if (routing.useRAG) {
      // RAG-based response
      return await this.executeRAGFlow(request);
    } else if (routing.mcpTools.length > 0) {
      // MCP tools with LLM processing
      return await this.executeMCPFlow(request, routing.mcpTools);
    } else {
      // Direct LLM response
      return await this.executeDirectLLMFlow(request);
    }
  }

  /**
   * Generate streaming response
   */
  async generateStreamingResponse(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tools: string[]) => void,
  ): Promise<ChatResponse> {
    const { message, conversationHistory = [] } = request;

    // Use smart routing to determine approach
    const routing = await this.smartRouting(message, conversationHistory);

    if (routing.directResponse && routing.mcpTools.length > 0) {
      // Direct MCP tool response WITH streaming
      return await this.executeDirectMCPFlow(request, routing.mcpTools, onChunk, onToolsStarting);
    } else if (routing.useRAG) {
      // RAG-based response WITH streaming
      return await this.executeRAGFlow(request, onChunk);
    } else if (routing.mcpTools.length > 0) {
      // MCP tools with LLM processing and streaming
      return await this.executeMCPFlow(request, routing.mcpTools, onChunk, onToolsStarting);
    } else {
      // Direct LLM response WITH streaming
      return await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Unified RAG execution that handles both streaming and non-streaming
   */
  private async executeRAGFlow(
    request: ChatRequest,
    onChunk?: (chunk: string) => void,
  ): Promise<ChatResponse> {
    const { message, conversationHistory = [] } = request;

    try {
      // Search for relevant context
      const searchResults = await this.embeddingService.searchSimilar(message, 3);
      const retrievedChunks = searchResults.results.map((result) => result.content);

      if (retrievedChunks.length === 0) {
        logger.warn('No RAG context found, falling back to direct LLM response');
        return await this.executeDirectLLMFlow(request, onChunk);
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
      const response = onChunk
        ? await this.llmService.generateStreamingResponse(messages, {
            model: request.model ?? 'gpt-4o-mini',
            temperature: request.temperature ?? 0.7,
            maxTokens: 1000,
            onChunk,
          })
        : await this.llmService.generateResponse(messages, {
            model: request.model ?? 'gpt-4o-mini',
            temperature: request.temperature ?? 0.7,
            maxTokens: 1000,
          });

      return {
        response: response.message,
        model: response.model ?? 'gpt-4o-mini',
        contextUsed: true,
        retrievedChunks,
        usage: response.usage,
      };
    } catch (error) {
      logger.error('RAG flow failed:', error);
      // Fallback to direct LLM response
      return await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute MCP tool calls with LLM processing
   */
  private async executeMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk?: (chunk: string) => void,
    onToolsStarting?: (tools: string[]) => void,
  ): Promise<ChatResponse> {
    const { message, conversationHistory = [] } = request;

    try {
      // Notify that tools are starting
      onToolsStarting?.(toolNames);

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
      const response = onChunk
        ? await this.llmService.generateStreamingResponse(messages, {
            model: request.model ?? 'gpt-4o-mini',
            temperature: request.temperature ?? 0.7,
            maxTokens: 1000,
            onChunk,
          })
        : await this.llmService.generateResponse(messages, {
            model: request.model ?? 'gpt-4o-mini',
            temperature: request.temperature ?? 0.7,
            maxTokens: 1000,
          });

      return {
        response: response.message,
        model: response.model ?? 'gpt-4o-mini',
        contextUsed: true,
        retrievedChunks: toolResults,
        usage: response.usage,
      };
    } catch (error) {
      logger.error('MCP flow failed:', error);
      // Fallback to direct LLM response
      return await this.executeDirectLLMFlow(request, onChunk);
    }
  }

  /**
   * Execute direct MCP tool calls with streaming
   */
  private async executeDirectMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk?: (chunk: string) => void,
    onToolsStarting?: (tools: string[]) => void,
  ): Promise<MCPDirectResponse> {
    try {
      // Notify about tools starting (only for streaming requests)
      if (onChunk && onToolsStarting) {
        onToolsStarting(toolNames);
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
        const formatted = response.formatted;
        const words = formatted.split(/(\s+)/);
        for (const word of words) {
          if (word) {
            onChunk(word);
            await new Promise((resolve) => setTimeout(resolve, 25));
          }
        }
      }

      return response;
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
  ): Promise<ChatResponse> {
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

    const response = onChunk
      ? await this.llmService.generateStreamingResponse(messages, {
          model: request.model ?? 'gpt-4o-mini',
          temperature: request.temperature ?? 0.7,
          maxTokens: 1000,
          onChunk,
        })
      : await this.llmService.generateResponse(messages, {
          model: request.model ?? 'gpt-4o-mini',
          temperature: request.temperature ?? 0.7,
          maxTokens: 1000,
        });

    return {
      response: response.message,
      model: response.model ?? 'gpt-4o-mini',
      contextUsed: false,
      retrievedChunks: undefined,
      usage: response.usage,
    };
  }
}
