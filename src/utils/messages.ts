/**
 * User-facing messages for the application
 */
export const MESSAGES = {
  spotify: {
    noTrack: "I'm not currently listening to anything on Spotify.",
  },

  github: {
    noActivity: "I'm having trouble accessing my GitHub activity right now.",
    noProfile: "I'm having trouble accessing my GitHub profile.",
  },

  blog: {
    noPosts: "I don't have any recent blog posts to share right now.",
    error: "I'm having trouble accessing my blog posts right now.",
  },

  general: {
    noData: 'No data available at the moment.',
  },

  mcp: {
    parsingFailed: 'Failed to parse response data',
  },

  llm: {
    streamingFailed: 'Streaming failed',
    streamingFailedGeneral: 'Failed to generate streaming LLM response',
  },

  api: {
    failedResponse: 'Failed to generate response',
  },

  error: {
    internalServer: 'Internal Server Error',
  },

  validation: {
    messageEmpty: 'Message cannot be empty',
    messageTooLong: 'Message too long',
  },
} as const;
