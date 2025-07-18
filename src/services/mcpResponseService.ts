import { mcpClient } from '@/services/mcpClientService';
import { logger } from '@/utils/logger';
import { MESSAGES } from '@/utils/messages';
import { formatDistanceToNow } from 'date-fns/formatDistanceToNow';
import {
  SpotifyTrackData,
  GitHubActivityData,
  BlogPostData,
  ProjectInfoData,
  MCPDirectResponse,
  MCPResponseFormatter,
  MCPToolCall,
  MCPToolResult,
} from '@/types';

export class MCPResponseService {
  private formatters: Map<string, MCPResponseFormatter> = new Map();

  constructor() {
    this.registerDefaultFormatters();
  }

  /**
   * Register a formatter for a specific MCP service
   */
  registerFormatter(formatter: MCPResponseFormatter): void {
    this.formatters.set(formatter.service, formatter);
    logger.info(`Registered Backend formatter for service: ${formatter.service}`);
  }

  /**
   * Generate a direct MCP response
   */
  async formatDirectResponse(tools: MCPToolCall[]): Promise<MCPDirectResponse> {
    const startTime = Date.now();

    try {
      logger.info(
        `Generating direct MCP response for tools: ${tools.map((t) => t.name).join(', ')}`,
      );

      // Call all needed tools
      const results: MCPToolResult[] = [];
      for (const tool of tools) {
        const result = await mcpClient.callTool(tool);
        results.push(result);

        logger.info(`MCP tool ${tool.name} raw result:`, {
          isError: result.isError,
          contentLength: result.content.length,
          firstContentType: result.content[0]?.type,
          firstContentText: `${result.content[0]?.text?.substring(0, 300)}...`,
        });
      }

      // Determine the primary service based on tools
      const service = this.determineService(tools);
      logger.info(`Determined service: ${service}`);

      // Get the appropriate formatter
      const formatter = this.formatters.get(service);
      if (!formatter) {
        throw new Error(`No formatter registered for service: ${service}`);
      }

      // Format the response
      const { data, formatted } = formatter.format(results);

      logger.info(`Formatted response for ${service}:`, {
        dataKeys: Object.keys(data),
        formattedLength: formatted.length,
        formattedPreview: `${formatted.substring(0, 200)}...`,
      });

      const responseTime = Date.now() - startTime;

      return {
        type: 'mcp_direct',
        service,
        data,
        formatted,
        metadata: {
          timestamp: new Date().toISOString(),
          tools: tools.map((t) => t.name),
          responseTime,
        },
      };
    } catch (error) {
      logger.error('Failed to generate direct MCP response:', error);
      throw error;
    }
  }

  /**
   * Determine which service the tools belong to
   */
  private determineService(tools: MCPToolCall[]): string {
    const toolToService: Record<string, string> = {
      get_current_spotify_track: 'spotify',
      get_github_activity: 'github',
      get_latest_blog_post: 'blog',
      get_project_info: 'project',
    };

    // Use the first tool's service, or default to 'unknown'
    const firstToolName = tools[0]?.name;
    return firstToolName ? toolToService[firstToolName] || 'unknown' : 'unknown';
  }

  /**
   * Register default formatters for common services
   */
  private registerDefaultFormatters(): void {
    // Spotify formatter
    this.registerFormatter({
      service: 'spotify',
      tools: ['get_current_spotify_track'],
      format: (results): { data: SpotifyTrackData; formatted: string } => {
        const spotifyResult = results[0];

        if (!spotifyResult || spotifyResult.isError || !spotifyResult.content.length) {
          logger.warn('Spotify formatter: No valid result or error occurred');
          return {
            data: { error: MESSAGES.general.noData },
            formatted: MESSAGES.spotify.noTrack,
          };
        }

        try {
          // Parse the Spotify response (assuming it's JSON)
          const firstContent = spotifyResult.content[0];
          if (!firstContent) {
            logger.warn('Spotify formatter: No content in result');
            return {
              data: { error: MESSAGES.mcp.noContent },
              formatted: MESSAGES.spotify.noTrack,
            };
          }

          logger.info('Spotify formatter: Parsing JSON response', {
            textLength: firstContent.text.length,
            textPreview: `${firstContent.text.substring(0, 200)}...`,
          });

          const trackData = JSON.parse(firstContent.text);

          // Check if this is an error response from the MCP tool
          if (trackData.error) {
            logger.warn('Spotify formatter: MCP tool returned error', { error: trackData.error });
            return {
              data: { error: trackData.error },
              formatted: trackData.error,
            };
          }

          logger.info('Spotify formatter: Parsed track data', {
            trackName: trackData.name,
            artistCount: trackData.artists?.length,
            hasAlbum: !!trackData.album,
            hasUrl: !!trackData.external_urls,
          });

          const data: SpotifyTrackData = {
            track: trackData.name,
            artist: trackData.artists?.[0]?.name,
            album: trackData.album?.name,
            url: trackData.external_urls?.spotify,
            played_at: trackData.played_at,
          };

          const formatted = this.formatSpotifyResponse(data);

          return { data, formatted };
        } catch (error) {
          logger.error('Failed to parse Spotify response:', error);
          return {
            data: { error: MESSAGES.mcp.parsingFailed },
            formatted: MESSAGES.spotify.error,
          };
        }
      },
    });

    // GitHub formatter
    this.registerFormatter({
      service: 'github',
      tools: ['get_github_activity'],
      format: (results): { data: GitHubActivityData; formatted: string } => {
        const githubResult = results[0];

        if (!githubResult || githubResult.isError || !githubResult.content.length) {
          logger.warn('GitHub formatter: No valid result or error occurred');
          return {
            data: { error: MESSAGES.general.noData },
            formatted: MESSAGES.github.noActivity,
          };
        }

        try {
          // Parse the GitHub response (assuming it's JSON)
          const firstContent = githubResult.content[0];
          if (!firstContent) {
            logger.warn('GitHub formatter: No content in result');
            return {
              data: { error: MESSAGES.mcp.noContent },
              formatted: MESSAGES.github.noActivity,
            };
          }

          logger.info('GitHub formatter: Parsing JSON response', {
            textLength: firstContent.text.length,
            textPreview: `${firstContent.text.substring(0, 200)}...`,
          });

          const githubData = JSON.parse(firstContent.text);

          // Check if this is an error response from the MCP tool
          if (githubData.error) {
            logger.warn('GitHub formatter: MCP tool returned error', { error: githubData.error });
            return {
              data: { error: githubData.error },
              formatted: githubData.error,
            };
          }

          logger.info('GitHub formatter: Parsed GitHub data', {
            username: githubData.username,
            totalContributions: githubData.totalContributions,
            pinnedReposCount: githubData.pinnedRepos?.length,
          });

          const data: GitHubActivityData = {
            username: githubData.username,
            profileUrl: githubData.profileUrl,
            totalContributions: githubData.totalContributions,
            pinnedRepos: githubData.pinnedRepos ?? [],
          };

          const formatted = this.formatGitHubResponse(data);

          return { data, formatted };
        } catch (error) {
          logger.error('Failed to parse GitHub response:', error);
          return {
            data: { error: MESSAGES.mcp.parsingFailed },
            formatted: MESSAGES.github.noActivity,
          };
        }
      },
    });

    // Blog formatter
    this.registerFormatter({
      service: 'blog',
      tools: ['get_latest_blog_post'],
      format: (results): { data: BlogPostData; formatted: string } => {
        const blogResult = results[0];

        if (!blogResult || blogResult.isError || !blogResult.content.length) {
          logger.warn('Blog formatter: No valid result or error occurred');
          return {
            data: { error: MESSAGES.general.noData },
            formatted: MESSAGES.blog.error,
          };
        }

        try {
          // Parse the blog response (assuming it's JSON)
          const firstContent = blogResult.content[0];
          if (!firstContent) {
            logger.warn('Blog formatter: No content in result');
            return {
              data: { error: MESSAGES.mcp.noContent },
              formatted: MESSAGES.blog.error,
            };
          }

          logger.info('Blog formatter: Parsing JSON response', {
            textLength: firstContent.text.length,
            textPreview: `${firstContent.text.substring(0, 200)}...`,
          });

          const blogData = JSON.parse(firstContent.text);

          // Check if this is an error response from the MCP tool
          if (blogData.error) {
            logger.warn('Blog formatter: MCP tool returned error', { error: blogData.error });
            return {
              data: { error: blogData.error },
              formatted: blogData.error,
            };
          }

          logger.info('Blog formatter: Parsed blog data', {
            title: blogData.title,
            hasLink: !!blogData.link,
            publishedAt: blogData.publishedAt,
          });

          // blogData is a single post object: { title, link, publishedAt }
          const data: BlogPostData = {
            title: blogData.title,
            url: blogData.link,
            publishedAt: blogData.publishedAt,
          };

          const formatted = this.formatBlogResponse(data);

          return { data, formatted };
        } catch (error) {
          logger.error('Failed to parse blog response:', error);
          return {
            data: { error: MESSAGES.mcp.parsingFailed },
            formatted: MESSAGES.blog.error,
          };
        }
      },
    });

    // Project info formatter
    this.registerFormatter({
      service: 'project',
      tools: ['get_project_info'],
      format: (results): { data: ProjectInfoData; formatted: string } => {
        const projectResult = results[0];

        if (!projectResult || projectResult.isError || !projectResult.content.length) {
          return {
            data: { error: MESSAGES.general.noData },
            formatted: 'No project info available.',
          };
        }

        try {
          const firstContent = projectResult.content[0];
          if (!firstContent) {
            return {
              data: { error: MESSAGES.mcp.noContent },
              formatted: 'No project info available.',
            };
          }

          const projectData = JSON.parse(firstContent.text);

          if (projectData.error) {
            return {
              data: { error: projectData.error },
              formatted: projectData.error,
            };
          }

          const data: ProjectInfoData = {
            name: projectData.name,
            description: projectData.description,
            url: projectData.url,
            technologies: projectData.technologies ?? [],
          };
          const formatted = this.formatProjectInfoResponse(data);
          return { data, formatted };
        } catch (error) {
          logger.error('Failed to parse Project Info response:', error);
          return {
            data: { error: MESSAGES.mcp.parsingFailed },
            formatted: 'Error parsing project info.',
          };
        }
      },
    });
  }

  /**
   * Format Spotify response in a user-friendly way
   */
  private formatSpotifyResponse(data: SpotifyTrackData): string {
    if (data.error) {
      return data.error;
    }

    if (!data.track || !data.artist) {
      return MESSAGES.spotify.noTrack;
    }

    let timeAgo = '';
    if (data.played_at) {
      try {
        timeAgo = formatDistanceToNow(new Date(data.played_at), {
          addSuffix: true,
        });
      } catch {
        timeAgo = '';
      }
    }

    // Emoji, relative date first, then info (similar to blog)
    return `About **${timeAgo}** I listened 💿 to: [${data.track} by ${data.artist}](${data.url})`;
  }

  /**
   * Format GitHub response in a user-friendly way
   */
  private formatGitHubResponse(data: GitHubActivityData): string {
    if (data.error) {
      return data.error;
    }

    if (!data.username) {
      return MESSAGES.github.noProfile;
    }

    let response = `So far I've made 🎉 **${data.totalContributions}** contributions in the last year. Here's some of my pinned repos:\n\n`;

    // Add pinned repositories if available
    if (data.pinnedRepos && data.pinnedRepos.length > 0) {
      data.pinnedRepos.forEach((repo) => {
        const description = repo.description ?? 'No description.';
        response += `- [${repo.name}](${repo.url}): ${description}\n`;
      });
    } else {
      response += 'No pinned repositories found.';
    }

    return response.trim();
  }

  /**
   * Format blog response in a user-friendly way
   */
  private formatBlogResponse(data: BlogPostData): string {
    if (data.error) {
      return data.error;
    }

    if (!data.title || !data.url) {
      return MESSAGES.blog.noPosts;
    }

    let timeAgo = '';
    if (data.publishedAt) {
      try {
        timeAgo = formatDistanceToNow(new Date(data.publishedAt), {
          addSuffix: true,
        });
      } catch {
        timeAgo = '';
      }
    }

    return `About **${timeAgo}** I wrote ✍️ a post titled: [${data.title}](${data.url})`;
  }

  /**
   * Format Project Info response in a user-friendly way
   */
  private formatProjectInfoResponse(data: ProjectInfoData): string {
    if (data.error) {
      return data.error;
    }

    // Headline and description
    const headline = data.name ? `# ${data.name}\n` : '';
    const description = data.description ? `${data.description}\n` : '';

    // Tech stack section
    let techStackSection = '';
    if (Array.isArray(data.technologies) && data.technologies.length > 0) {
      const techStackList = data.technologies.map((item: string) => `- ${item}`).join('\n');
      techStackSection = `# Tech Stack\n${techStackList}\n`;
    }

    // Repo link section
    const repoSection = data.url
      ? `# Repo\nCheck it out on [Github](${data.url}) for more details.`
      : '';

    // Combine all sections, filtering out any empty ones
    return [headline, description, techStackSection, repoSection].filter(Boolean).join('\n');
  }
}

// Export singleton instance
export const mcpResponseService = new MCPResponseService();
