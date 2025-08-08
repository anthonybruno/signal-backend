import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import axios, { type AxiosInstance } from 'axios';

import type { MCPToolCall, MCPToolResult } from '@/types';
import { logger } from '@/utils/logger';

class MCPClientService {
  private client: Client | null = null;
  private httpClient: AxiosInstance | null = null;
  private isConnected = false;
  private transportType: 'stdio' | 'http' = 'stdio';
  private mcpServerUrl = '';

  async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    // Determine transport type from environment
    this.transportType =
      process.env.MCP_TRANSPORT === 'http' ? 'http' : 'stdio';
    this.mcpServerUrl = process.env.MCP_SERVER_URL || 'http://localhost:3001';

    try {
      if (this.transportType === 'http') {
        await this.connectHttp();
      } else {
        await this.connectStdio();
      }
    } catch (error) {
      logger.error('Failed to connect to MCP server:', error);
      logger.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        transportType: this.transportType,
      });
      throw new Error('MCP server connection failed');
    }
  }

  private async connectHttp(): Promise<void> {
    logger.info('Starting MCP HTTP connection...', { url: this.mcpServerUrl });

    // Create HTTP client
    this.httpClient = axios.create({
      baseURL: this.mcpServerUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Test connection with health check
    try {
      const healthResponse = await this.httpClient.get('/health');
      logger.info('MCP HTTP server health check passed', {
        status: healthResponse.status,
      });
      this.isConnected = true;
      logger.info('Connected to MCP server via HTTP successfully');
    } catch (error) {
      logger.error('MCP HTTP server health check failed:', error);
      throw new Error('MCP HTTP server connection failed');
    }
  }

  private async connectStdio(): Promise<void> {
    logger.info('Starting MCP stdio connection...');

    // Create transport that spawns the MCP server
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.js'],
      cwd: '../tonybot-mcp-server',
    });

    logger.info('Transport created, creating client...');

    // Create and connect client
    this.client = new Client(
      {
        name: 'tonybot-backend',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    logger.info('Client created, attempting connection...');

    await this.client.connect(transport);
    this.isConnected = true;

    logger.info('Connected to MCP server via stdio successfully');
  }

  async listTools(): Promise<unknown[]> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      if (this.transportType === 'http' && this.httpClient) {
        const response = await this.httpClient.post('/mcp', {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        });
        return response.data.result?.tools ?? [];
      } else if (this.client) {
        const response = await this.client.listTools();
        return response.tools;
      } else {
        throw new Error('No client available');
      }
    } catch (error) {
      logger.error('Failed to list MCP tools:', error);
      throw new Error('Failed to list MCP tools');
    }
  }

  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isConnected) {
      await this.connect();
    }

    try {
      logger.info('Calling MCP tool', {
        name: toolCall.name,
        args: toolCall.arguments,
        transport: this.transportType,
      });

      let response;
      if (this.transportType === 'http' && this.httpClient) {
        const httpResponse = await this.httpClient.post('/mcp', {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/call',
          params: {
            name: toolCall.name,
            arguments: toolCall.arguments ?? {},
          },
        });
        response = httpResponse.data.result;
      } else if (this.client) {
        response = await this.client.callTool({
          name: toolCall.name,
          arguments: toolCall.arguments ?? {},
        });
      } else {
        throw new Error('No client available');
      }

      logger.debug('MCP tool response received', { name: toolCall.name });

      // Ensure content is properly typed as an array
      const { content: responseContent } = response;
      let content;
      if (Array.isArray(responseContent)) {
        content = responseContent;
      } else if (responseContent) {
        content = [{ type: 'text', text: String(responseContent) }];
      } else {
        content = [];
      }

      return {
        content,
        isError: Boolean(response.isError),
      };
    } catch (error) {
      logger.error('MCP tool call failed:', error);

      return {
        content: [
          {
            type: 'text',
            text: `Failed to call tool "${toolCall.name}": ${
              error instanceof Error ? error.message : 'Unknown error'
            }`,
          },
        ],
        isError: true,
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
        logger.info('Disconnected from MCP server (stdio)');
      } catch (error) {
        logger.error('Error disconnecting from MCP server (stdio):', error);
      }
    }

    if (this.httpClient) {
      // HTTP client doesn't need explicit disconnection
      logger.info('Disconnected from MCP server (HTTP)');
    }

    this.isConnected = false;
    this.client = null;
    this.httpClient = null;
  }
}

// Export singleton instance
export const mcpClient = new MCPClientService();
