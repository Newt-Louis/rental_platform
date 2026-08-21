import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { MCPServerService } from './mcp-server.service';

const SYSTEM_PROMPT_CODEBASE = `Bạn là trợ lý AI chuyên gia về THISO Leasing Platform codebase.

Nhiệm vụ:
- Trả lời các câu hỏi về cấu trúc dự án, modules, API endpoints
- Giải thích luồng business (CRM → Proposal → Contract → Billing)
- Giúp hiểu database schema, data models
- Hướng dẫn tìm file, function, component trong codebase
- Gợi ý best practices, conventions được sử dụng trong dự án

Quy tắc:
- Sử dụng MCP context được cung cấp để trả lời chính xác
- Nếu không có thông tin, nói rõ "Không có dữ liệu về..."
- Trả lời bằng tiếng Việt, sử dụng markdown khi cần
- Cung cấp file paths, line numbers khi relevant`;

@Injectable()
export class AiCodebaseService {
  private readonly logger = new Logger(AiCodebaseService.name);

  constructor(private mcpService: MCPServerService) {}

  /**
   * Chat về codebase using MCP context
   */
  async chat(message: string, history: { role: string; content: string }[]) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'AI service chưa được cấu hình. Vui lòng liên hệ Admin.',
      );
    }

    // Lấy context từ MCP
    const context = await this.buildMCPContext(message);

    const messages = [
      ...history.slice(-6).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      {
        role: 'user' as const,
        content: context
          ? `[Codebase Context]\n${context}\n\n[Question]\n${message}`
          : message,
      },
    ];

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: SYSTEM_PROMPT_CODEBASE,
          messages,
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        this.logger.error(`Claude API error ${response.status}: ${err.substring(0, 300)}`);
        throw new Error(`Claude API ${response.status}`);
      }

      const data = (await response.json()) as any;
      const reply: string = data.content?.[0]?.text ?? 'Không có phản hồi từ AI.';

      return { reply, timestamp: new Date().toISOString() };
    } catch (error) {
      this.logger.error(`AI codebase chat failed: ${error.message}`);
      throw new ServiceUnavailableException('AI service tạm thời không khả dụng.');
    }
  }

  /**
   * Chat với streaming (SSE)
   */
  async chatStream(
    message: string,
    history: { role: string; content: string }[],
    onChunk: (text: string) => void,
  ): Promise<void> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');

    const context = await this.buildMCPContext(message);

    const messages = [
      ...history.slice(-6).map((h) => ({
        role: h.role as 'user' | 'assistant',
        content: h.content,
      })),
      {
        role: 'user' as const,
        content: context
          ? `[Codebase Context]\n${context}\n\n[Question]\n${message}`
          : message,
      },
    ];

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'messages-2023-12-15',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        stream: true,
        system: SYSTEM_PROMPT_CODEBASE,
        messages,
      }),
    });

    if (!response.ok) {
      throw new Error(`Claude API error: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data:')) {
            try {
              const data = JSON.parse(line.slice(5));
              if (data.type === 'content_block_delta') {
                const text = data.delta?.text || '';
                if (text) onChunk(text);
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Gợi ý câu hỏi
   */
  getSuggestions() {
    return [
      '📁 Cấu trúc folder của dự án như thế nào?',
      '📦 Các modules chính của backend là gì?',
      '🔄 Luồng từ Lead đến Contract là gì?',
      '💰 Approval workflow hoạt động thế nào?',
      '🗄️ Database schema chứa những model nào?',
      '🛣️ Các API endpoints chính là gì?',
      '📋 Code conventions trong dự án là gì?',
      '🔍 Tìm file ConvertToProposalDialog',
      '⚙️ Module proposals làm gì?',
      '🔐 Auth & RBAC hoạt động thế nào?',
    ];
  }

  /**
   * Build context từ MCP based on user query
   */
  private async buildMCPContext(message: string): Promise<string> {
    try {
      const keywords = message.toLowerCase();

      // Detect what context is needed
      let context = '';

      if (
        keywords.includes('cấu trúc') ||
        keywords.includes('folder') ||
        keywords.includes('structure')
      ) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '1',
          method: 'resources/read',
          params: { uri: 'codebase://structure' },
        });
        context = (result as any)?.result?.content || '';
      }

      if (
        keywords.includes('module') ||
        keywords.includes('modules') ||
        keywords.includes('service')
      ) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '2',
          method: 'resources/read',
          params: { uri: 'codebase://modules' },
        });
        context += (result as any)?.result?.content || '';
      }

      if (
        keywords.includes('api') ||
        keywords.includes('endpoint') ||
        keywords.includes('route')
      ) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '3',
          method: 'resources/read',
          params: { uri: 'codebase://api-routes' },
        });
        context += (result as any)?.result?.content || '';
      }

      if (
        keywords.includes('luồng') ||
        keywords.includes('flow') ||
        keywords.includes('process')
      ) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '4',
          method: 'resources/read',
          params: { uri: 'codebase://business-flows' },
        });
        context += (result as any)?.result?.content || '';
      }

      if (
        keywords.includes('convention') ||
        keywords.includes('chuẩn') ||
        keywords.includes('standard')
      ) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '5',
          method: 'resources/read',
          params: { uri: 'codebase://conventions' },
        });
        context += (result as any)?.result?.content || '';
      }

      if (keywords.includes('schema') || keywords.includes('database')) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '6',
          method: 'resources/read',
          params: { uri: 'codebase://schema' },
        });
        context += (result as any)?.result?.content || '';
      }

      // If no context matched, provide overview
      if (!context) {
        const result = this.mcpService.handleRequest({
          jsonrpc: '2.0',
          id: '7',
          method: 'resources/read',
          params: { uri: 'codebase://modules' },
        });
        context = (result as any)?.result?.content || '';
      }

      return context.substring(0, 5000); // Limit to 5000 chars
    } catch (err) {
      this.logger.warn(`Failed to build MCP context: ${err.message}`);
      return '';
    }
  }
}
