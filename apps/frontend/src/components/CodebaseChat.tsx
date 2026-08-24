import React, { useEffect, useRef } from 'react';
import { Send, Loader } from 'lucide-react';
import { useCodebaseChat } from '@/hooks/useCodebaseChat';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function CodebaseChat() {
  const {
    messages,
    isLoading,
    suggestions,
    sendMessage,
    loadSuggestions,
  } = useCodebaseChat();

  const [input, setInput] = React.useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const message = input;
    setInput('');
    await sendMessage(message);
  };

  const handleSendSuggestion = async (suggestion: string) => {
    setInput('');
    await sendMessage(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[600px] max-w-2xl mx-auto bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4">
        <h2 className="text-xl font-bold">💬 Codebase Chat</h2>
        <p className="text-sm opacity-90">
          Hỏi về cấu trúc dự án, modules, API, luồng business...
        </p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`flex ${
              msg.role === 'user' ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.role === 'user'
                  ? 'bg-purple-600 text-white rounded-br-none'
                  : 'bg-gray-200 text-gray-800 rounded-bl-none'
              }`}
            >
              <div className="text-sm whitespace-pre-wrap break-words">
                {msg.content}
              </div>
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      {/* Suggestions */}
      {suggestions.length > 0 && messages.length === 1 && (
        <div className="px-4 py-3 bg-white border-t border-gray-200">
          <p className="text-xs text-gray-500 mb-2 font-medium">
            Câu hỏi gợi ý:
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {suggestions.slice(0, 4).map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => handleSendSuggestion(suggestion)}
                className="text-left text-xs p-2 bg-gray-100 hover:bg-purple-100 text-gray-700 hover:text-purple-700 rounded border border-gray-200 hover:border-purple-300 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-white">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Hỏi gì về codebase..."
            className="flex-1"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
          >
            {isLoading ? (
              <Loader size={18} className="animate-spin" />
            ) : (
              <Send size={18} />
            )}
            <span className="hidden sm:inline">Gửi</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
