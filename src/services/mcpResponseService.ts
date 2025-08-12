/* eslint-disable import/order */
import {
  formatSpotifyData,
  formatGitHubData,
  formatBlogData,
  formatProjectData,
} from '@/utils/formatters';
import { mcpClient } from '@/services/mcpClientService';
import type { ChatRequest } from '@/types';

export interface MCPToolCall {
  name: string;
  arguments?: Record<string, unknown>;
}

export interface MCPToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

export interface MCPDirectResponse {
  type: 'mcp_direct';
  service: string;
  data: MCPServiceData;
  formatted: string;
  mcp_tool: string;
  metadata: {
    timestamp: string;
    responseTime: number;
  };
}

export type MCPServiceData =
  | SpotifyTrackData
  | GitHubActivityData
  | BlogPostData
  | ProjectInfoData;

// Service-specific data types
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

import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';

export class MCPResponseService {
  async executeMCPFlow(
    request: ChatRequest,
    toolNames: string[],
    onChunk: (chunk: string) => void,
    onToolsStarting?: (tool: string) => void,
  ): Promise<void> {
    try {
      onToolsStarting?.(toolNames[0]);

      const toolCalls: MCPToolCall[] = toolNames.map((toolName) => ({
        name: toolName,
        arguments: {},
      }));

      const response = await this.createDirectResponse(toolCalls);
      await this.streamResponse(response.formatted, onChunk);
    } catch (error) {
      logger.error('MCP flow failed:', error);
      throw new Error('Failed to execute MCP tools');
    }
  }

  private async streamResponse(
    formattedResponse: string,
    onChunk: (chunk: string) => void,
  ): Promise<void> {
    const words = formattedResponse.split(/(\s+)/);

    for (const word of words) {
      if (word) {
        onChunk(word);
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  }

  async createDirectResponse(tools: MCPToolCall[]): Promise<MCPDirectResponse> {
    const startTime = Date.now();

    try {
      logger.info(
        `Generating MCP response for tools: ${tools.map((tool) => tool.name).join(', ')}`,
      );

      const results: MCPToolResult[] = [];
      for (const tool of tools) {
        const result = await mcpClient.callTool(tool);
        results.push(result);
      }

      const service = this.identifyService(tools);
      logger.info(`Identified service: ${service}`);

      const { data, formatted } = this.createResponseByService(
        service,
        results,
      );

      const responseTime = Date.now() - startTime;

      return {
        type: 'mcp_direct',
        service,
        data,
        formatted,
        mcp_tool: tools[0].name,
        metadata: {
          timestamp: new Date().toISOString(),
          responseTime,
        },
      };
    } catch (error) {
      logger.error('Failed to generate MCP response:', error);
      throw error;
    }
  }

  private identifyService(tools: MCPToolCall[]): string {
    const toolToService: Record<string, string> = {
      get_current_spotify_track: 'spotify',
      get_github_activity: 'github',
      get_latest_blog_post: 'blog',
      get_project_info: 'project',
    };

    const firstToolName = tools[0]?.name;
    return firstToolName
      ? toolToService[firstToolName] || 'unknown'
      : 'unknown';
  }

  private createResponseByService(
    service: string,
    results: MCPToolResult[],
  ): {
    data:
      | SpotifyTrackData
      | GitHubActivityData
      | BlogPostData
      | ProjectInfoData;
    formatted: string;
  } {
    const [result] = results;

    if (result.isError || !result.content.length) {
      return {
        data: { error: MESSAGES.general.noData },
        formatted: this.getDefaultMessage(service),
      };
    }

    try {
      const [firstContent] = result.content;
      const serviceData = JSON.parse(firstContent.text);

      if (serviceData.error) {
        return {
          data: { error: serviceData.error },
          formatted: serviceData.error,
        };
      }

      const formatters = {
        spotify: () => formatSpotifyData(serviceData),
        github: () => formatGitHubData(serviceData),
        blog: () => formatBlogData(serviceData),
        project: () => formatProjectData(serviceData),
      } as const;

      return formatters[service as keyof typeof formatters]();
    } catch (error) {
      logger.error(`Failed to parse ${service} response:`, error);
      return {
        data: { error: MESSAGES.mcp.parsingFailed },
        formatted: this.getDefaultMessage(service),
      };
    }
  }

  private getDefaultMessage(service: string): string {
    const messages: Record<string, string> = {
      spotify: MESSAGES.spotify.noTrack,
      github: MESSAGES.github.noActivity,
      blog: MESSAGES.blog.error,
      project: 'No project info available.',
    };
    return messages[service] || 'No data available.';
  }
}
