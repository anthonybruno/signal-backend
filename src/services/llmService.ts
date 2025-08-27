import axios, { type AxiosInstance } from 'axios';

import { getEnv } from '@/config/env';
import type { ChatMessage, ChatResponse, ChatRequest } from '@/types';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';
import { formatSystemPrompt, SYSTEM_PROMPT } from '@/utils/prompts';

export interface IntentDecision {
  useRAG: boolean;
  mcpTool: string;
  reasoning: string;
}

export class LLMService {
  private readonly openRouterClient: AxiosInstance;
  private readonly defaultModel: string;
  private readonly intentDispatcherModel: string;

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
      timeout: 30000,
    });
  }

  getDefaultModel(): string {
    return this.defaultModel;
  }

  getSystemPrompt(contextChunks: string[] = []): string {
    return formatSystemPrompt(contextChunks);
  }

  async analyzeIntent(prompt: string): Promise<IntentDecision> {
    try {
      const response = await this.openRouterClient.post('/chat/completions', {
        model: this.intentDispatcherModel,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        max_tokens: 200,
      });

      const { choices } = response.data;
      if (!choices?.[0]?.message?.content) {
        throw new Error('No routing decision received');
      }

      const content = choices[0].message.content.trim();
      const jsonText = this.extractJsonFromResponse(content);
      return JSON.parse(jsonText);
    } catch (error) {
      logger.error('Intent analysis failed:', error);
      throw this.createIntentError(error);
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
          max_tokens: options?.maxTokens || 4000,
          stream: true,
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
            } catch {
              // Skip invalid JSON lines
            }
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

  async executeDirectLLMFlow(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const { message, history = [] } = request;

    const messages: ChatMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history,
      { role: 'user', content: message },
    ];

    await this.streamResponse(messages, {
      onChunk,
    });
  }

  private extractJsonFromResponse(content: string): string {
    if (content.startsWith('```json')) {
      return content.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    }
    if (content.startsWith('```')) {
      return content.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }
    return content;
  }

  private createIntentError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      return new Error(
        `Intent analysis failed: ${error.response?.data?.error?.message ?? error.message}`,
      );
    }
    return new Error('Failed to analyze user intent');
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
