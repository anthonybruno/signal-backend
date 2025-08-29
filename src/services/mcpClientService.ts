import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import axios, { type AxiosInstance } from 'axios';

import type { MCPToolCall, MCPToolResult } from '@/services/mcpResponseService';
import { logger } from '@/utils/logger';

type TransportType = 'stdio' | 'http';

/**
 * Manages MCP server connections and tool execution
 */
class MCPClientService {
  private client: Client | null = null;
  private httpClient: AxiosInstance | null = null;
  private isConnected = false;
  private transportType: TransportType = 'stdio';
  private mcpServerUrl = '';

  /**
   * Establishes connection to MCP server based on environment configuration
   */
  async connect(): Promise<void> {
    if (this.isConnected) return;

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
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('MCP server connection failed', {
        error: errorMessage,
        transportType: this.transportType,
      });
      throw new Error(`MCP server connection failed: ${errorMessage}`);
    }
  }

  /**
   * Establishes HTTP connection to MCP server
   */
  private async connectHttp(): Promise<void> {
    this.httpClient = axios.create({
      baseURL: this.mcpServerUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' },
    });

    try {
      await this.httpClient.get('/health');
      this.isConnected = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`MCP HTTP server connection failed: ${errorMessage}`);
    }
  }

  /**
   * Establishes stdio connection to MCP server
   */
  private async connectStdio(): Promise<void> {
    const transport = new StdioClientTransport({
      command: 'node',
      args: ['dist/index.js'],
      cwd: '../mcp',
    });

    this.client = new Client(
      { name: 'signal-backend', version: '1.0.0' },
      { capabilities: { tools: {} } },
    );

    try {
      await this.client.connect(transport);
      this.isConnected = true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('MCP stdio connection failed', { error: errorMessage });
      throw new Error(`MCP stdio connection failed: ${errorMessage}`);
    }
  }

  /**
   * Lists available MCP tools
   */
  async listTools(): Promise<unknown[]> {
    if (!this.isConnected) await this.connect();

    try {
      if (this.transportType === 'http' && this.httpClient) {
        const response = await this.httpClient.post('/mcp', {
          jsonrpc: '2.0',
          id: Date.now(),
          method: 'tools/list',
          params: {},
        });
        return response.data.result?.tools ?? [];
      }

      if (this.client) {
        const response = await this.client.listTools();
        return response.tools;
      }

      throw new Error('No MCP client available');
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to list MCP tools', { error: errorMessage });
      throw new Error(`Failed to list MCP tools: ${errorMessage}`);
    }
  }

  /**
   * Executes an MCP tool call
   */
  async callTool(toolCall: MCPToolCall): Promise<MCPToolResult> {
    if (!this.isConnected) await this.connect();

    try {
      const response = await this.executeToolCall(toolCall);
      const content = this.normalizeResponseContent(response.content);

      return { content, isError: Boolean(response.isError) };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      logger.error('MCP tool execution failed', {
        toolName: toolCall.name,
        error: errorMessage,
      });

      return {
        content: [
          { type: 'text', text: `Tool execution failed: ${errorMessage}` },
        ],
        isError: true,
      };
    }
  }

  /**
   * Executes tool call based on transport type
   */
  private async executeToolCall(toolCall: MCPToolCall) {
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
      return httpResponse.data.result;
    }

    if (this.client) {
      return await this.client.callTool({
        name: toolCall.name,
        arguments: toolCall.arguments ?? {},
      });
    }

    throw new Error('No MCP client available');
  }

  /**
   * Normalizes response content to ensure consistent array format
   */
  private normalizeResponseContent(responseContent: unknown) {
    if (Array.isArray(responseContent)) {
      return responseContent;
    }

    if (responseContent) {
      return [{ type: 'text', text: String(responseContent) }];
    }

    return [];
  }

  /**
   * Disconnects from MCP server and cleans up resources
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        logger.error('Error disconnecting from MCP server (stdio)', {
          error: errorMessage,
        });
      }
    }

    this.isConnected = false;
    this.client = null;
    this.httpClient = null;
  }
}

export const mcpClient = new MCPClientService();
