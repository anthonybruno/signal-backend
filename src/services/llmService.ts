import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '@/config/env';
import { formatSystemPrompt } from '@/prompts';
import type { ChatMessage, TokenUsage, ChatResponse } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

export interface IntentDecision {
  useRAG: boolean;
  mcpTool: string;
  reasoning: string;
}

export class LLMService {
  private openRouterClient: AxiosInstance;
  private defaultModel: string;
  private intentDispatcherModel: string;

  constructor() {
    const env = getEnv();

    this.defaultModel = env.DEFAULT_MODEL;
    this.intentDispatcherModel = env.INTENT_DISPATCHER_MODEL;
    this.openRouterClient = axios.create({
      baseURL: 'https://openrouter.ai/api/v1',
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Title': 'Signal',
      },
      timeout: 30000, // 30 second timeout
    });
  }

  /**
   * Analyze user intent and dispatch to appropriate service
   */
  async intentDispatcher(prompt: string): Promise<IntentDecision> {
    try {
      const response = await this.openRouterClient.post('/chat/completions', {
        model: this.intentDispatcherModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const { choices } = response.data;

      if (!choices || choices.length === 0) {
        throw new Error('No routing decision received');
      }

      const assistantMessage = choices[0].message.content;

      // Parse the JSON response (handle markdown code blocks)
      let jsonText = assistantMessage.trim();

      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const decision: IntentDecision = JSON.parse(jsonText);

      return decision;
    } catch (error) {
      logger.error('Intent analysis failed:', error);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const errorData = error.response?.data;

        if (status === 401) {
          throw new Error('Invalid API key for intent analysis');
        } else if (status === 429) {
          throw new Error('Rate limit exceeded for intent analysis');
        } else if (status === 400) {
          throw new Error(
            `Bad request for intent analysis: ${errorData?.error?.message ?? 'Bad request'}`,
          );
        }
      }

      throw new Error('Failed to analyze user intent');
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
      const response = await this.openRouterClient.post(
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
}
