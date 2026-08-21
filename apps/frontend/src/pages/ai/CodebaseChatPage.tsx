import { CodebaseChat } from '@/components/CodebaseChat';

export default function CodebaseChatPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🤖 AI Assistant — THISO Leasing
          </h1>
          <p className="text-gray-600">
            Hỏi AI về codebase, architecture, modules, API endpoints...
          </p>
        </div>

        <CodebaseChat />

        {/* Info section */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl mb-2">📁</div>
            <h3 className="font-semibold text-gray-900 mb-1">Cấu trúc</h3>
            <p className="text-sm text-gray-600">
              Hiểu rõ folder structure, modules, packages
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl mb-2">🔗</div>
            <h3 className="font-semibold text-gray-900 mb-1">API</h3>
            <p className="text-sm text-gray-600">
              Tìm endpoints, parameters, responses
            </p>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-2xl mb-2">🔄</div>
            <h3 className="font-semibold text-gray-900 mb-1">Luồng</h3>
            <p className="text-sm text-gray-600">
              Hiểu business flows, approval workflow
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
