import {
  Controller,
  Post,
  Body,
  Get,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AiCodebaseService } from './ai-codebase.service';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@ApiTags('Codebase Chat')
@Controller('ai/codebase')
export class CodebaseChatController {
  constructor(private readonly aiCodebaseService: AiCodebaseService) {}

  /**
   * Serve HTML chat interface
   */
  @Get('chat-ui')
  @Public()
  @ApiOperation({ summary: 'Codebase Chat UI' })
  getChatUI(@Res() res: Response) {
    const html = this.getHtmlInterface();
    res.type('text/html').send(html);
  }

  /**
   * Chat endpoint (non-streaming)
   */
  @Post('chat')
  @Public()
  @ApiOperation({ summary: 'Chat about codebase' })
  async chat(
    @Body()
    body: { message: string; history?: { role: string; content: string }[] },
  ) {
    return this.aiCodebaseService.chat(body.message, body.history ?? []);
  }

  /**
   * Chat endpoint (streaming SSE)
   */
  @Post('chat/stream')
  @Public()
  @ApiOperation({ summary: 'Chat about codebase (streaming)' })
  async chatStream(
    @Body() body: { message: string; history?: { role: string; content: string }[] },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    try {
      await this.aiCodebaseService.chatStream(
        body.message,
        body.history ?? [],
        (chunk) => {
          res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
        },
      );
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    } catch (e) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
    } finally {
      res.end();
    }
  }

  /**
   * Get suggestions
   */
  @Get('suggestions')
  @Public()
  @ApiOperation({ summary: 'Get suggested questions' })
  getSuggestions() {
    return { suggestions: this.aiCodebaseService.getSuggestions() };
  }

  // ────────────────────── HTML Interface ──────────────────────

  private getHtmlInterface(): string {
    return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>THISO Leasing — Codebase Chat</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }

    .container {
      width: 100%;
      max-width: 900px;
      height: 90vh;
      max-height: 600px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 20px;
      text-align: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .header h1 {
      font-size: 24px;
      margin-bottom: 5px;
    }

    .header p {
      font-size: 13px;
      opacity: 0.9;
    }

    .chat-area {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 15px;
    }

    .message {
      display: flex;
      margin-bottom: 10px;
      animation: slideIn 0.3s ease-out;
    }

    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .message.user {
      justify-content: flex-end;
    }

    .message.assistant {
      justify-content: flex-start;
    }

    .message-content {
      max-width: 70%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.5;
      font-size: 14px;
      word-wrap: break-word;
    }

    .message.user .message-content {
      background: #667eea;
      color: white;
      border-bottom-right-radius: 4px;
    }

    .message.assistant .message-content {
      background: #f0f0f0;
      color: #333;
      border-bottom-left-radius: 4px;
    }

    .suggestions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
      padding: 20px;
      background: #fafafa;
      border-top: 1px solid #eee;
    }

    .suggestion-btn {
      padding: 12px;
      border: 1px solid #ddd;
      border-radius: 8px;
      background: white;
      cursor: pointer;
      font-size: 13px;
      transition: all 0.2s;
      text-align: left;
    }

    .suggestion-btn:hover {
      background: #f0f0f0;
      border-color: #667eea;
      color: #667eea;
    }

    .input-area {
      display: flex;
      gap: 10px;
      padding: 15px 20px;
      border-top: 1px solid #eee;
      background: white;
    }

    .input-field {
      flex: 1;
      padding: 12px 15px;
      border: 1px solid #ddd;
      border-radius: 8px;
      font-size: 14px;
      resize: none;
      max-height: 100px;
      font-family: inherit;
    }

    .input-field:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }

    .send-btn {
      padding: 12px 20px;
      background: #667eea;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
      white-space: nowrap;
    }

    .send-btn:hover:not(:disabled) {
      background: #5568d3;
    }

    .send-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .loading {
      display: flex;
      gap: 4px;
      align-items: center;
    }

    .loading span {
      width: 6px;
      height: 6px;
      background: #667eea;
      border-radius: 50%;
      animation: bounce 1.4s infinite;
    }

    .loading span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .loading span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes bounce {
      0%, 80%, 100% {
        opacity: 0.5;
        transform: translateY(0);
      }
      40% {
        opacity: 1;
        transform: translateY(-8px);
      }
    }

    .markdown {
      white-space: pre-wrap;
      word-break: break-word;
    }

    .markdown strong {
      font-weight: 600;
      color: #667eea;
    }

    .markdown code {
      background: rgba(0, 0, 0, 0.05);
      padding: 2px 6px;
      border-radius: 3px;
      font-family: 'Monaco', 'Courier New', monospace;
      font-size: 12px;
    }

    .markdown ul {
      margin-left: 20px;
    }

    @media (max-width: 768px) {
      .container {
        max-height: 100%;
      }

      .message-content {
        max-width: 85%;
      }

      .suggestions {
        grid-template-columns: 1fr;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💬 THISO Leasing Codebase Chat</h1>
      <p>Hỏi về cấu trúc dự án, modules, API, luồng business...</p>
    </div>

    <div class="chat-area" id="chatArea"></div>

    <div class="suggestions" id="suggestionsArea"></div>

    <div class="input-area">
      <textarea
        id="messageInput"
        class="input-field"
        placeholder="Hỏi gì về codebase... (Ví: Giải thích luồng booking)"
        rows="2"
      ></textarea>
      <button id="sendBtn" class="send-btn">Gửi</button>
    </div>
  </div>

  <script>
    const chatArea = document.getElementById('chatArea');
    const suggestionsArea = document.getElementById('suggestionsArea');
    const messageInput = document.getElementById('messageInput');
    const sendBtn = document.getElementById('sendBtn');

    let history = [];

    // Load suggestions
    async function loadSuggestions() {
      try {
        const res = await fetch('/api/ai/codebase/suggestions');
        const data = await res.json();
        suggestionsArea.innerHTML = data.suggestions
          .map(
            (s) =>
              \`<button class="suggestion-btn" onclick="sendMessage('\${s}')">\${s}</button>\`,
          )
          .join('');
      } catch (err) {
        console.error('Failed to load suggestions', err);
      }
    }

    // Send message
    async function sendMessage(text) {
      const message = text || messageInput.value.trim();
      if (!message) return;

      messageInput.value = '';
      suggestionsArea.style.display = 'none';

      // Add user message
      addMessage('user', message);
      history.push({ role: 'user', content: message });

      // Show loading
      sendBtn.disabled = true;
      const loadingId = Date.now();
      addMessage('assistant', '<div class="loading"><span></span><span></span><span></span></div>');

      try {
        // Call chat endpoint with streaming
        const response = await fetch('/api/ai/codebase/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, history: history.slice(-6) }),
        });

        if (!response.ok) throw new Error(\`HTTP \${response.status}\`);

        let assistantMessage = '';
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // Remove loading indicator
        chatArea.removeChild(chatArea.lastChild);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\\n');

          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5));
                if (data.text) {
                  assistantMessage += data.text;
                  updateLastMessage(assistantMessage);
                }
              } catch (e) {}
            }
          }
        }

        history.push({ role: 'assistant', content: assistantMessage });
      } catch (err) {
        // Remove loading, show error
        chatArea.removeChild(chatArea.lastChild);
        addMessage('assistant', \`❌ Lỗi: \${err.message}\`);
      } finally {
        sendBtn.disabled = false;
        messageInput.focus();
      }
    }

    function addMessage(role, content) {
      const div = document.createElement('div');
      div.className = \`message \${role}\`;
      div.innerHTML = \`<div class="message-content markdown">\${escapeHtml(content)}</div>\`;
      chatArea.appendChild(div);
      chatArea.scrollTop = chatArea.scrollHeight;
    }

    function updateLastMessage(content) {
      const lastContent = chatArea.lastChild?.querySelector('.message-content');
      if (lastContent) {
        lastContent.innerHTML = escapeHtml(content);
      }
      chatArea.scrollTop = chatArea.scrollHeight;
    }

    function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    // Event listeners
    sendBtn.addEventListener('click', () => sendMessage());
    messageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Initialize
    loadSuggestions();
    addMessage('assistant', '👋 Xin chào! Tôi là AI assistant chuyên giải thích về THISO Leasing codebase. Hỏi tôi về cấu trúc dự án, modules, API, luồng business, v.v...');
  </script>
</body>
</html>`;
  }
}
