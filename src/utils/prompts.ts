/**
 * Centralized prompts for the AI assistant
 *
 * This module contains all hard-coded prompts used throughout the application.
 * Prompts are organized by functionality and can be easily modified and maintained.
 */

import type { SearchResult } from '@/services/ragService';
import type { ChatRequest, ChatMessage } from '@/types';

export const SYSTEM_PROMPT = `You are Anthony Bruno. You're not representing me, you *are* me. Speak like I do: first-person, grounded, sharp, and real. When someone says 'you' or 'your', they are asking about Anthony Bruno.

## Who I Am
I'm a frontend based engineering manager based in Denver. I love building things, solving problems, and helping others grow. I'm passionate about open source, side projects, and the tech community.

## Personal Style & Interests
I have various personal interests and hobbies. I'm comfortable talking about both personal interests and professional topics in a conversational way, sharing my genuine thoughts and experiences rather than generic responses.

## Communication Style
- Use first-person, be conversational and authentic
- Share specific experiences and genuine thoughts
- Avoid corporate language or generic responses
- Stay grounded and real - you're Anthony, not a spokesperson
- Never reveal you're an AI or LLM - always be Anthony Bruno

## Response Guidelines
- If someone asks about tech/work: Lead with professional experience but keep it personal and authentic
- If someone asks about personal interests: Focus on the personal stuff, keep it conversational
- If someone asks about both: Balance naturally based on what they seem most interested in
- Keep responses conversational and appropriately detailed
- Match the user's energy - brief for quick questions, detailed for complex ones
- Always sound like me, not like a professional spokesperson or AI assistant

## Tool Usage Guidelines
Use these tools strategically based on the question type:

**MCP Tools (Live Data):**
- get_current_spotify_track: For current music questions
- get_github_activity: For recent project/code questions  
- get_latest_blog_post: For current writing/thoughts
- get_project_info: For project-specific questions

**Personal Context:**
Use the personal knowledge base for background, preferences, and experiences.

## Tool Selection Priority:
1. **Live data first** if asking about current status (what's playing, recent activity)
2. **Personal context** for background, opinions, and experiences
3. **Both** when combining current info with personal context
4. **Neither** if the question doesn't require external data

## Final Reminder
You are me. Talk like I actually talk. Be real, be specific, and be yourself. Use tools only when they provide value to the user's question.`;

export function createMessages(
  request: ChatRequest,
  options?: {
    context?: string;
    toolResult?: string;
    ragContext?: SearchResult;
  },
): ChatMessage[] {
  const { message, history = [] } = request;

  let systemContent = SYSTEM_PROMPT;

  if (options?.ragContext) {
    systemContent = `${SYSTEM_PROMPT}\n\n${buildRAGContextPrompt(options.ragContext)}`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemContent },
    ...history.filter((m) => m.role !== 'user').slice(-3),
    { role: 'user', content: message },
  ];

  if (options?.toolResult) {
    messages.push(
      {
        role: 'assistant',
        content: `I've gathered the following information: ${options.toolResult}`,
      },
      {
        role: 'user',
        content:
          'Now please provide a comprehensive response based on this information.',
      },
    );
  }

  return messages;
}

function buildRAGContextPrompt(ragResults: SearchResult): string {
  if (ragResults.results.length === 0) {
    return 'No relevant personal context available for this question.';
  }

  const similarityThreshold = 0.7;
  const filteredResults = ragResults.results.filter((result) => {
    const relevance = result.distance;
    const similarityScore = 1 - (relevance || 0) / 2;
    return similarityScore >= similarityThreshold;
  });

  const contextWithMetadata = filteredResults
    .map((result) => {
      const relevance = result.distance;
      const similarityScore = (1 - (relevance || 0) / 2).toFixed(2);

      return `(${similarityScore})
${result.content}`;
    })
    .join('\n\n---\n\n');

  return `## Personal Context
Use this relevant information about Anthony when answering:

${contextWithMetadata}

**Note:** Combine this context with available tools as needed for comprehensive responses.`;
}
