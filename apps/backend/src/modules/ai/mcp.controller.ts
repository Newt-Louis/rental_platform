import { Controller, Post, Body, HttpCode, UseGuards, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiBody } from '@nestjs/swagger';
import { MCPServerService, MCPRequest } from './mcp-server.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

/**
 * MCP (Model Context Protocol) Server
 *
 * Allows AI clients to query codebase structure, modules, schema, and more in realtime.
 * Resources are served dynamically without needing to upload static documentation.
 *
 * Usage from AI client:
 * 1. POST /ai-v2/mcp with { jsonrpc, id, method, params }
 * 2. Server returns codebase info in realtime
 * 3. AI can search code, read files, list modules, etc
 */
@ApiTags('AI — MCP Server')
@Controller('ai-v2')
export class MCPController {
  constructor(private readonly mcpService: MCPServerService) {}

  /**
   * MCP Request Handler
   *
   * JSON-RPC 2.0 compatible endpoint for MCP clients.
   * Supports multiple methods for querying codebase structure.
   *
   * @example
   * POST /api/ai-v2/mcp
   * {
   *   "jsonrpc": "2.0",
   *   "id": 1,
   *   "method": "initialize",
   *   "params": {}
   * }
   */
  @Post('mcp')
  @HttpCode(200)
  @Public() // Allow without auth for now (can add auth later)
  @ApiOperation({
    summary: 'MCP Request Handler',
    description: 'JSON-RPC 2.0 endpoint for MCP clients to query codebase realtime',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        jsonrpc: { type: 'string', example: '2.0' },
        id: { type: 'string', example: '1' },
        method: {
          type: 'string',
          enum: [
            'initialize',
            'resources/list',
            'resources/read',
            'tools/list',
            'tools/call',
          ],
        },
        params: { type: 'object' },
      },
    },
  })
  handleMCPRequest(@Body() request: MCPRequest) {
    return this.mcpService.handleRequest(request);
  }

  /**
   * Status endpoint to verify MCP server is running
   */
  @Get('mcp/status')
  @Public()
  @ApiOperation({ summary: 'MCP Server Status' })
  getStatus() {
    return {
      status: 'running',
      version: '1.0.0',
      endpoint: '/api/ai-v2/mcp',
      protocol: 'JSON-RPC 2.0',
      description: 'THISO Leasing MCP Server - Realtime codebase query',
      methods: [
        'initialize',
        'resources/list',
        'resources/read',
        'tools/list',
        'tools/call',
      ],
    };
  }

  /**
   * Quick reference for AI clients
   */
  @Get('mcp/docs')
  @Public()
  @ApiOperation({ summary: 'MCP Quick Reference' })
  getDocs() {
    return {
      title: 'THISO Leasing MCP Server',
      description:
        'Query codebase structure, modules, schema, and search code in realtime',
      endpoint: 'POST /api/ai-v2/mcp',
      protocol: 'JSON-RPC 2.0',
      examples: {
        initialize: {
          request: {
            jsonrpc: '2.0',
            id: '1',
            method: 'initialize',
            params: {},
          },
          description: 'Initialize connection and get server capabilities',
        },
        listResources: {
          request: {
            jsonrpc: '2.0',
            id: '2',
            method: 'resources/list',
            params: {},
          },
          description:
            'List available resources (structure, modules, schema, routes, flows, conventions)',
        },
        readResource: {
          request: {
            jsonrpc: '2.0',
            id: '3',
            method: 'resources/read',
            params: { uri: 'codebase://structure' },
          },
          description: 'Read a specific resource',
          availableUris: [
            'codebase://structure',
            'codebase://modules',
            'codebase://schema',
            'codebase://api-routes',
            'codebase://business-flows',
            'codebase://conventions',
          ],
        },
        listTools: {
          request: {
            jsonrpc: '2.0',
            id: '4',
            method: 'tools/list',
            params: {},
          },
          description: 'List available tools (search_code, get_file, etc)',
        },
        callTool: {
          request: {
            jsonrpc: '2.0',
            id: '5',
            method: 'tools/call',
            params: {
              name: 'search_code',
              arguments: { query: 'ConvertToProposal', type: 'file' },
            },
          },
          description: 'Call a tool to perform actions',
          availableTools: [
            'search_code',
            'get_file',
            'list_modules',
            'get_module_info',
          ],
        },
      },
      whyMCP: {
        purpose:
          'Allow AI clients to query fresh codebase data without uploading static docs',
        benefit:
          'When code changes, AI immediately sees updated structure without re-uploading',
        realtime: 'All data fetched on-demand from live codebase',
      },
    };
  }
}
