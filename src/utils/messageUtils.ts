import { getEnv } from '@/config/env';
import type { ChatRequest, ChatMessage } from '@/types';

const env = getEnv();

import { SYSTEM_PROMPT } from './prompts';

/**
 * Builds a message thread for the chat.
 *
 * @param request The chat request.
 * @param additionalContext Optional RAG context messages.
 * @returns The message thread.
 */

export function createMessageThread(
  request: ChatRequest,
  contextMessages?: ChatMessage[],
): ChatMessage[] {
  const { message, history = [] } = request;

  const messageThread: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...(contextMessages || []),
    ...history.filter((m) => m.role !== 'user').slice(-env.CHAT_HISTORY_LIMIT),
    { role: 'user', content: message },
  ];

  return messageThread;
}
