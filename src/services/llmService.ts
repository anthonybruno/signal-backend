import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '@/config/env';
import { formatSystemPrompt } from '@/prompts';
import type { ChatMessage, TokenUsage, ChatResponse } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

export class LLMService {
  private client: AxiosInstance;
  private defaultModel: string;

  constructor() {
    const env = getEnv();

    this.defaultModel = env.DEFAULT_MODEL;
    this.client = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3000', // Optional: for analytics
        'X-Title': 'Portfolio Chat Bot', // Optional: for analytics
      },
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Generate a chat completion
   */
  async generateResponse(
    messages: ChatMessage[],
    options?: {
      maxTokens: number | undefined;
    },
  ): Promise<ChatResponse> {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.defaultModel,
        messages,
        temperature: 0.7,
        max_tokens: options?.maxTokens ?? 4000,
        stream: false,
      });

      const { choices, usage, model } = response.data;

      if (!choices || choices.length === 0) {
        throw new Error(MESSAGES.llm.noResponse);
      }

      const assistantMessage = choices[0].message.content;

      logger.info('LLM response generated', {
        model,
        promptTokens: usage?.prompt_tokens,
        completionTokens: usage?.completion_tokens,
        totalTokens: usage?.total_tokens,
      });

      return {
        message: assistantMessage,
        model,
        usage,
      };
    } catch (error) {
      logger.error('LLM generation failed:', error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        if (status === 401) {
          throw new Error(MESSAGES.llm.invalidApiKey);
        } else if (status === 429) {
          throw new Error(MESSAGES.llm.rateLimit);
        } else if (status === 400) {
          throw new Error(
            `${MESSAGES.llm.badRequest}: ${errorData?.error?.message ?? 'Bad request'}`,
          );
        }
      }

      throw new Error(MESSAGES.llm.failed);
    }
  }

  /**
   * Get the default model being used
   */
  getDefaultModel(): string {
    return this.defaultModel;
  }

  /**
   * Get the system prompt that defines the assistant's personality and behavior
   */
  getSystemPrompt(contextChunks: string[] = []): string {
    return formatSystemPrompt(contextChunks);
  }

  /**
   * Generate a streaming chat completion
   */
  async generateStreamingResponse(
    messages: ChatMessage[],
    options?: {
      maxTokens: number | undefined;
      onChunk: ((chunk: string) => void) | undefined;
    },
  ): Promise<ChatResponse> {
    try {
      const response = await this.client.post(
        '/chat/completions',
        {
          model: this.defaultModel,
          messages,
          temperature: 0.7,
          max_tokens: options?.maxTokens ?? 4000,
          stream: true, // Enable streaming
        },
        {
          responseType: 'stream',
        },
      );

      let fullContent = '';
      let usage: TokenUsage | undefined = undefined;
      const model = this.defaultModel;

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk: Buffer) => {
          const lines = chunk.toString().split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);

              if (data === '[DONE]') {
                // Stream finished
                resolve({
                  message: fullContent,
                  model,
                  usage,
                });
                return;
              }

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;

                if (content) {
                  fullContent += content;
                  if (options?.onChunk) {
                    options.onChunk(content);
                  }
                }

                // Capture usage info if available
                if (parsed.usage) {
                  ({ usage } = parsed);
                }
              } catch {
                // Skip invalid JSON lines
                continue;
              }
            }
          }
        });

        response.data.on('error', (error: Error) => {
          logger.error('Streaming error:', error);
          reject(new Error(MESSAGES.llm.streamingFailed));
        });

        response.data.on('end', () => {
          // Fallback resolution if [DONE] wasn't received
          resolve({
            message: fullContent,
            model,
            usage,
          });
        });
      });
    } catch (error) {
      logger.error('Streaming LLM generation failed:', error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        if (status === 401) {
          throw new Error(MESSAGES.llm.invalidApiKey);
        } else if (status === 429) {
          throw new Error(MESSAGES.llm.rateLimit);
        } else if (status === 400) {
          throw new Error(
            `${MESSAGES.llm.badRequest}: ${errorData?.error?.message ?? 'Bad request'}`,
          );
        }
      }

      throw new Error(MESSAGES.llm.streamingFailedGeneral);
    }
  }

  /**
   * Test the LLM connection and prompt
   */
  async testConnection(): Promise<boolean> {
    try {
      const testMessages: ChatMessage[] = [
        {
          role: 'system',
          content: this.getSystemPrompt(),
        },
        {
          role: 'user',
          content: 'Hi! Can you briefly introduce yourself?',
        },
      ];

      await this.generateResponse(testMessages, {
        maxTokens: 100,
      });
      return true;
    } catch (error) {
      logger.error('LLM connection test failed:', error);
      return false;
    }
  }
}
