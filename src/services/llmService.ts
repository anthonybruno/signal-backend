import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '@/config/env';
import type { ChatMessage, ChatResponse, ChatRequest } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';
import { createMessages } from '@/utils/prompts';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

const TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_current_spotify_track',
      description:
        "Get the currently playing track from Anthony's Spotify account. Use this for questions about current music, what's playing now, or music preferences.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_github_activity',
      description:
        "Get recent GitHub activity and profile information. Use this for questions about Anthony's current projects, recent code contributions, or GitHub profile.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_latest_blog_post',
      description:
        "Get the latest blog post from Anthony's blog. Use this for questions about recent writing, current thoughts, or latest blog content.",
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_project_info',
      description:
        'Get information about this specific project. Use this for questions about the current project, its purpose, or technical details.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
];

export class LLMService {
  private readonly openRouterClient: AxiosInstance;
  private readonly defaultModel: string;

  constructor() {
    const env = getEnv();
    this.defaultModel = env.DEFAULT_MODEL;

    this.openRouterClient = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Signal',
      },
      timeout: 30000,
    });
  }

  async generateResponseWithTools(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    messages?: ChatMessage[],
  ): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
    const finalMessages = messages || createMessages(request);

    try {
      const response = await this.openRouterClient.post('/chat/completions', {
        model: this.defaultModel,
        messages: finalMessages,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        temperature: 0.9,
        max_tokens: 4000,
        stream: false,
        cache_control: {
          system_prompt: 'cache',
          tools: 'cache',
          user_messages: 'no-cache',
        },
      });

      const { choices } = response.data;
      const responseMessage = choices[0]?.message;

      if (
        responseMessage?.tool_calls &&
        responseMessage.tool_calls.length > 0
      ) {
        return { toolCalls: responseMessage.tool_calls as ToolCall[] };
      } else {
        await this.streamResponse(finalMessages, { onChunk });
        return { content: 'Streamed response' };
      }
    } catch (error) {
      logger.error('Tool calling failed:', error);
      throw this.createToolCallingError(error);
    }
  }

  async streamResponse(
    messages: ChatMessage[],
    options?: {
      onChunk?: (chunk: string) => void;
      maxTokens?: number;
    },
  ): Promise<ChatResponse> {
    try {
      const response = await this.openRouterClient.post(
        '/chat/completions',
        {
          model: this.defaultModel,
          messages,
          temperature: 0.9,
          max_tokens: 4000,
          stream: true,
          cache_control: {
            system_prompt: 'cache',
            user_messages: 'no-cache',
          },
        },
        { responseType: 'stream' },
      );

      let fullContent = '';
      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;

            const data = line.slice(6);
            if (data === '[DONE]') {
              resolve({
                message: fullContent,
              });
              return;
            }

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;

              if (content) {
                fullContent += content;
                options?.onChunk?.(content);
              }
            } catch {}
          }
        });

        response.data.on('error', (error: Error) => {
          logger.error('Streaming error:', error);
          reject(new Error(MESSAGES.llm.streamingFailed));
        });

        response.data.on('end', () => {
          resolve({ message: fullContent });
        });
      });
    } catch (error) {
      logger.error('Streaming LLM generation failed:', error);
      throw this.createStreamingError(error);
    }
  }

  private createToolCallingError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      return new Error(
        `Tool calling failed: ${error.response?.data?.error?.message ?? error.message}`,
      );
    }
    return new Error('Failed to call tools');
  }

  private createStreamingError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      return new Error(
        `Streaming failed: ${error.response?.data?.error?.message ?? error.message}`,
      );
    }
    return new Error(MESSAGES.llm.streamingFailedGeneral);
  }
}
