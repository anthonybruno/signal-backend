// User-facing messages for MCP services and general application
export const MESSAGES = {
  // Spotify-related messages
  spotify: {
    noTrack: "I'm not currently listening to anything on Spotify.",
    error: "I'm having trouble getting my current Spotify track.",
  },

  // GitHub-related messages
  github: {
    noActivity: "I'm having trouble accessing my GitHub activity right now.",
    noProfile: "I'm having trouble accessing my GitHub profile.",
  },

  // Blog-related messages
  blog: {
    noPosts: "I don't have any recent blog posts to share right now.",
    error: "I'm having trouble accessing my blog posts right now.",
  },

  // General error messages
  general: {
    connectionError: "Sorry, I'm having trouble connecting right now. Please try again.",
    parsingError: "I'm having trouble processing the data right now.",
    noData: 'No data available at the moment.',
  },

  // MCP service errors
  mcp: {
    noFormatter: (service: string) => `No formatter registered for service: ${service}`,
    noContent: 'No content in response',
    parsingFailed: 'Failed to parse response data',
  },

  // LLM-related messages
  llm: {
    noResponse: 'No response generated from LLM',
    invalidApiKey: 'Invalid OpenRouter API key',
    rateLimit: 'Rate limit exceeded. Please try again later.',
    badRequest: 'Invalid request',
    failed: 'Failed to generate LLM response',
    streamingFailed: 'Streaming failed',
    streamingFailedGeneral: 'Failed to generate streaming LLM response',
  },

  // RAG-related messages
  rag: {
    failed: 'Failed to generate response',
    systemTestFailed: 'RAG system test failed',
  },

  // API/Chat route messages
  api: {
    failedChat: 'Failed to generate chat response',
    failedResponse: 'Failed to generate response',
    mcpTestFailed: 'MCP test failed',
  },

  // Error handler/general errors
  error: {
    internalServer: 'Internal Server Error',
  },

  // Validation messages
  validation: {
    messageEmpty: 'Message cannot be empty',
    messageTooLong: 'Message too long',
    invalidRole: 'Role must be user or assistant',
    invalidModel: 'Invalid model',
    invalidTemperature: 'Temperature must be between 0 and 2',
    required: 'This field is required',
    invalidUrl: 'Must be a valid URL',
    positiveNumber: 'Must be a positive number',
  },
} as const;

// Helper function to get nested message safely
export function getMessage(path: string): string {
  const keys = path.split('.');
  let current: unknown = MESSAGES;

  for (const key of keys) {
    if (current && typeof current === 'object' && key in current) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return `Message not found: ${path}`;
    }
  }

  return typeof current === 'string' ? current : `Message not found: ${path}`;
}
