import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '@/config/env';
import type { ChatMessage, ChatRequest } from '@/types';
import { logger } from '@/utils/logger';
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
        'HTTP-Referer': 'https://signal.abruno.net',
        'X-Title':
          env.NODE_ENV === 'production' ? 'Signal - Prod' : 'Signal - Dev',
      },
      timeout: 30000,
    });
  }

  async generateResponse(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    messages?: ChatMessage[],
  ): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
    const messagesToSend = messages || createMessages(request);

    try {
      const response = await this.openRouterClient.post(
        '/chat/completions',
        {
          model: this.defaultModel,
          messages: messagesToSend,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          temperature: 0.9,
          max_tokens: 4000,
          stream: true,
          cache_control: {
            system_prompt: 'cache',
            tools: 'cache',
            user_messages: 'no-cache',
          },
        },
        { responseType: 'stream' },
      );

      return this.handleStreamResponse(response, onChunk);
    } catch (error) {
      logger.error('Tool calling failed:', error);
      throw this.createToolCallingError(error);
    }
  }

  private handleStreamResponse(
    response: { data: NodeJS.ReadableStream },
    onChunk: (chunk: string) => void,
  ): Promise<{ toolCalls?: ToolCall[]; content?: string }> {
    let fullContent = '';
    let toolCalls: ToolCall[] | undefined;

    return new Promise((resolve, reject) => {
      response.data.on('data', (chunk: Buffer) => {
        const lines = chunk.toString().split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6);
          if (data === '[DONE]') {
            resolve(
              toolCalls?.length ? { toolCalls } : { content: fullContent },
            );
            return;
          }

          try {
            const { delta } = JSON.parse(data).choices?.[0] || {};
            if (delta?.tool_calls) {
              if (!toolCalls) toolCalls = [];
              toolCalls.push(...delta.tool_calls);
            }
            if (delta?.content) {
              fullContent += delta.content;
              onChunk(delta.content);
            }
          } catch {}
        }
      });

      response.data.on('error', (error: Error) => {
        logger.error('Streaming error:', error);
        reject(new Error('Streaming failed'));
      });

      response.data.on('end', () => {
        resolve(toolCalls?.length ? { toolCalls } : { content: fullContent });
      });
    });
  }

  private createToolCallingError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      return new Error(
        `Tool calling failed: ${error.response?.data?.error?.message ?? error.message}`,
      );
    }
    return new Error('Failed to call tools');
  }
}
