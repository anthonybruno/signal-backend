// Chat and API Types
export interface ChatMessage {
  id?: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: Date;
  metadata?: {
    toolUsed?: string;
    toolInput?: Record<string, unknown>;
    toolOutput?: Record<string, unknown>;
  };
}

export interface ChatRequest {
  message: string;
  history?: ChatMessage[];
  context?: {
    userId?: string;
    sessionId?: string;
  };
}

export interface ChatResponse {
  message: string;
  model?: string;
  usage?: TokenUsage;
  history?: ChatMessage[];
  metadata?: {
    processingTime?: number;
    tokensUsed?: number;
    toolsUsed?: string[];
  };
}

// LLM Service Types
export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// RAG Types
export interface RAGDocument {
  id: string;
  content: string;
  metadata: {
    source: string;
    title?: string;
    url?: string;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
  };
  embedding?: number[];
}

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    source: string;
    section?: string;
    chunkIndex: number;
    totalChunks: number;
  };
}

export interface RAGQuery {
  query: string;
  filters?: {
    tags?: string[];
    sources?: string[];
    dateRange?: {
      start: Date;
      end: Date;
    };
  };
  limit?: number;
}

export interface RAGResult {
  documents: RAGDocument[];
  query: string;
  score: number;
  metadata?: {
    totalResults?: number;
    processingTime?: number;
  };
}

// MCP Types
export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{
    type: string;
    text: string;
  }>;
  isError?: boolean;
}

// MCP Response Service Types
export interface SpotifyTrackData {
  track?: string;
  artist?: string;
  album?: string;
  url?: string;
  played_at?: string;
  error?: string;
}

export interface GitHubActivityData {
  username?: string;
  profileUrl?: string;
  totalContributions?: number;
  pinnedRepos?: Array<{
    name: string;
    description?: string;
    url: string;
    language?: string;
    stars: number;
  }>;
  error?: string;
}

export interface BlogPostData {
  title?: string;
  url?: string;
  publishedAt?: string;
  error?: string;
}

export interface ProjectInfoData {
  name?: string;
  description?: string;
  url?: string;
  technologies?: string[];
  error?: string;
}

export type MCPServiceData = SpotifyTrackData | GitHubActivityData | BlogPostData | ProjectInfoData;

export interface MCPDirectResponse {
  type: 'mcp_direct';
  service: string;
  data: MCPServiceData;
  formatted: string;
  metadata: {
    timestamp: string;
    tools: string[];
    responseTime: number;
  };
}

export interface MCPResponseFormatter {
  service: string;
  tools: string[];
  format: (results: MCPToolResult[]) => { data: MCPServiceData; formatted: string };
}

// Error Types
export interface APIError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: Date;
}

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
  code?: string;
  details?: Record<string, unknown>;
}

// Health Check Types
export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  services: {
    [service: string]: {
      status: 'healthy' | 'degraded' | 'unhealthy';
      message?: string;
      responseTime?: number;
    };
  };
  version: string;
}

// Environment Types
export interface EnvironmentConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  DATABASE_URL?: string;
  OPENAI_API_KEY?: string;
  CORS_ORIGINS: string[];
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
}

// MCP Tool Response Types
export type ToolResponse = import('@modelcontextprotocol/sdk/types.js').CallToolResult;
