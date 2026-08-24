import { useState, useCallback } from 'react';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface UsecodebaseChatReturn {
  messages: Message[];
  isLoading: boolean;
  suggestions: string[];
  error: string | null;
  sendMessage: (message: string) => Promise<void>;
  loadSuggestions: () => Promise<void>;
}

export function useCodebaseChat(): UsecodebaseChatReturn {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: '👋 Xin chào! Tôi là AI assistant chuyên giải thích về THISO Leasing codebase. Hỏi tôi về cấu trúc dự án, modules, API, luồng business, v.v...',
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadSuggestions = useCallback(async () => {
    try {
      const res = await fetch('/api/ai/codebase/suggestions');
      if (!res.ok) throw new Error('Failed to load suggestions');
      const data = await res.json();
      setSuggestions(data.suggestions || []);
    } catch (err: any) {
      console.error('Failed to load suggestions', err);
      setError(err.message);
    }
  }, []);

  const sendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      // Add user message
      const userMessage: Message = { role: 'user', content: message };
      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setError(null);

      try {
        // Add placeholder for assistant message
        const placeholderId = Date.now();
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '⏳ Đang suy nghĩ...' },
        ]);

        // Call streaming endpoint
        const response = await fetch('/api/ai/codebase/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            history: messages.filter((m) => m.role !== undefined),
          }),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        let assistantMessage = '';
        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data:')) {
              try {
                const data = JSON.parse(line.slice(5));
                if (data.text) {
                  assistantMessage += data.text;
                  // Update the last message (placeholder)
                  setMessages((prev) => {
                    const updated = [...prev];
                    if (updated.length > 0) {
                      updated[updated.length - 1] = {
                        role: 'assistant',
                        content: assistantMessage,
                      };
                    }
                    return updated;
                  });
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        reader.releaseLock();
      } catch (err: any) {
        setError(err.message);
        // Remove placeholder if error
        setMessages((prev) => prev.slice(0, -1));
        // Add error message
        setMessages((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `❌ Lỗi: ${err.message}`,
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    },
    [messages],
  );

  return {
    messages,
    isLoading,
    suggestions,
    error,
    sendMessage,
    loadSuggestions,
  };
}
