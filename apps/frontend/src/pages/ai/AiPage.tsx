import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { aiApi, floorPlanApi, spacesApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { AsyncState } from '@/components/ui/async-state';
import {
  Send, Bot, User, Sparkles, Upload, FileText, CheckCircle, Clock,
  XCircle, ChevronRight, Building2, Layers, Map, BarChart3, Lightbulb,
  TrendingUp, RefreshCw, CheckCheck, ArrowRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface FloorUnit {
  code: string;
  areaGFA: number;
  areaNLA: number;
  category: string;
  baseRentPerSqm: number;
  askingRentPerSqm?: number;
  notes?: string;
}

interface FloorZone {
  code: string;
  name: string;
  category: string;
  categoryVi: string;
  estimatedArea: number;
  unitCount: number;
  trafficLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  position: string;
  description: string;
  suggestedTenants: string[];
  advantages: string;
  suggestedRentRange: string;
  units: FloorUnit[];
}

interface FloorData {
  level: string;
  name: string;
  estimatedArea: number;
  highlight: string;
  zones: FloorZone[];
}

interface AnalysisData {
  mall: {
    name: string;
    totalFloors: number;
    estimatedTotalArea: number;
    detectedFeatures: string[];
  };
  floors: FloorData[];
  insights: {
    anchorZones: string[];
    fnbClusters: string[];
    fashionBelt: string[];
    entertainmentHub: string[];
    trafficFlow: string;
    optimizationTips: string[];
    keyFindings: string[];
    tenantMixRecommendation: string;
  };
  zoneSuggestions: {
    code: string;
    floor: string;
    zoneName: string;
    category: string;
    estimatedArea: number;
    priority: string;
    reason: string;
    suggestedRentRange: string;
  }[];
}

interface Analysis {
  id: string;
  mallId: string;
  fileName: string;
  fileSizeKb: number;
  version: number;
  status: string;
  analysis: AnalysisData | null;
  suggestions: unknown[];
  appliedAt: string | null;
  createdAt: string;
  mall: { id: string; name: string; code: string };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CATEGORY_CFG: Record<string, { label: string; color: string; bg: string }> = {
  FASHION:       { label: 'Thời trang',   color: 'text-purple-700', bg: 'bg-purple-100' },
  FNB:           { label: 'F&B',          color: 'text-orange-700', bg: 'bg-orange-100' },
  ENTERTAINMENT: { label: 'Giải trí',     color: 'text-gray-700',   bg: 'bg-blue-100' },
  SERVICES:      { label: 'Dịch vụ',      color: 'text-teal-700',   bg: 'bg-teal-100' },
  ANCHOR:        { label: 'Anchor',        color: 'text-red-700',    bg: 'bg-red-100' },
  BEAUTY:        { label: 'Làm đẹp',      color: 'text-pink-700',   bg: 'bg-pink-100' },
  SUPERMARKET:   { label: 'Siêu thị',     color: 'text-green-700',  bg: 'bg-green-100' },
  MIXED:         { label: 'Hỗn hợp',      color: 'text-gray-700',   bg: 'bg-gray-100' },
};

const TRAFFIC_CFG: Record<string, { label: string; color: string }> = {
  HIGH:   { label: 'Cao',    color: 'text-green-600' },
  MEDIUM: { label: 'Trung bình', color: 'text-yellow-600' },
  LOW:    { label: 'Thấp',   color: 'text-gray-500' },
};

const PRIORITY_CFG: Record<string, { label: string; color: string }> = {
  HIGH:   { label: 'Ưu tiên cao',    color: 'bg-red-100 text-red-700' },
  MEDIUM: { label: 'Ưu tiên trung',  color: 'bg-yellow-100 text-yellow-700' },
  LOW:    { label: 'Ưu tiên thấp',   color: 'bg-gray-100 text-gray-600' },
};

const STATUS_CFG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PENDING:    { label: 'Chờ xử lý',  color: 'bg-gray-100 text-gray-600',   icon: <Clock size={13} /> },
  PROCESSING: { label: 'Đang phân tích', color: 'bg-blue-100 text-gray-700', icon: <RefreshCw size={13} className="animate-spin" /> },
  COMPLETED:  { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: <CheckCircle size={13} /> },
  FAILED:     { label: 'Thất bại',   color: 'bg-red-100 text-red-700',     icon: <XCircle size={13} /> },
};

// ─── Chat Tab ─────────────────────────────────────────────────────────────────

function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Xin chào! Tôi là trợ lý AI của THISO Leasing. Tôi có thể giúp bạn trả lời câu hỏi về mặt bằng, hợp đồng, công nợ và các số liệu vận hành. Hỏi gì đi nào!',
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: suggestionsData, isError: suggestionsError, refetch: refetchSuggestions } = useQuery({
    queryKey: ['ai-suggestions'],
    queryFn: aiApi.suggestions,
  });
  const suggestions: string[] = suggestionsData?.data ?? suggestionsData ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (msg: string) => {
    if (!msg.trim() || streaming) return;
    setInput('');
    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, userMsg]);

    setStreaming(true);
    abortRef.current = new AbortController();
    const placeholder: Message = { role: 'assistant', content: '', timestamp: new Date().toISOString() };
    setMessages((prev) => [...prev, placeholder]);

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/ai/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: msg, history }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        // fall back to non-streaming
        const data = await aiApi.chat(msg, history);
        const reply = data?.data ?? data;
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: reply.reply, timestamp: reply.timestamp };
          return next;
        });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          try {
            const ev = JSON.parse(line.slice(5).trim());
            if (ev.text) {
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                next[next.length - 1] = { ...last, content: last.content + ev.text };
                return next;
              });
            }
            if (ev.done) break;
          } catch {}
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setMessages((prev) => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: 'Lỗi kết nối AI. Vui lòng thử lại.', timestamp: new Date().toISOString() };
          return next;
        });
      }
    } finally {
      setStreaming(false);
    }
  };

  const isPending = streaming;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {messages.length <= 1 && suggestions.length > 0 && (
        <div className="mb-4 shrink-0">
          <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
            <Sparkles size={12} /> Gợi ý câu hỏi
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => send(s)}
                className="text-xs px-3 py-1.5 bg-gray-50 text-gray-700 rounded-full hover:bg-blue-100 transition-colors border border-gray-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      {messages.length <= 1 && suggestionsError && (
        <AsyncState
          isLoading={false}
          isError
          onRetry={refetchSuggestions}
          errorTitle="Không thể tải gợi ý câu hỏi"
          errorDescription="Bạn vẫn có thể nhập câu hỏi trực tiếp bên dưới."
        >
          <div />
        </AsyncState>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-1">
        {messages.map((msg, i) => (
          <div key={i} className={`flex items-start gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              msg.role === 'assistant' ? 'bg-gradient-to-br from-blue-500 to-purple-600' : 'bg-gray-200'
            }`}>
              {msg.role === 'assistant' ? <Bot size={14} className="text-white" /> : <User size={14} className="text-gray-600" />}
            </div>
            <div className={`max-w-[75%] flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === 'assistant' ? 'bg-white border border-gray-200 text-gray-800' : 'bg-gray-900 text-white'
              }`}>
                {msg.content.split('**').map((part, j) =>
                  j % 2 === 1 ? <strong key={j}>{part}</strong> : <span key={j}>{part}</span>,
                )}
              </div>
              <span className="text-xs text-gray-400 mt-1 px-1">
                {new Date(msg.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}
        {isPending && (
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot size={14} className="text-white" />
            </div>
            <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl">
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0">
        <div className="flex gap-2 bg-white border border-gray-200 rounded-2xl p-2 shadow-sm">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send(input)}
            placeholder="Hỏi về mặt bằng, hợp đồng, công nợ..."
            className="border-0 focus-visible:ring-0 bg-transparent"
            disabled={isPending}
          />
          <Button onClick={() => send(input)} disabled={!input.trim() || isPending} size="sm" className="rounded-xl gap-1.5">
            <Send size={14} /> Gửi
          </Button>
        </div>
        <p className="text-xs text-gray-400 text-center mt-2">AI sử dụng dữ liệu thật từ database</p>
      </div>
    </div>
  );
}

// ─── Zone Card ───────────────────────────────────────────────────────────────

function ZoneCard({ zone }: { zone: FloorZone }) {
  const [expanded, setExpanded] = useState(false);
  const cat = CATEGORY_CFG[zone.category] ?? CATEGORY_CFG.MIXED;
  const traffic = TRAFFIC_CFG[zone.trafficLevel] ?? TRAFFIC_CFG.MEDIUM;
  const units = zone.units ?? [];

  const fmtRent = (v?: number) => v ? new Intl.NumberFormat('vi-VN', { notation: 'compact' }).format(v) + '/m²' : '—';

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>
          {zone.code}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-900 truncate">{zone.name}</div>
          <div className="text-xs text-gray-400">
            {cat.label} · {zone.estimatedArea?.toLocaleString()} m²
            {units.length > 0 && <span className="ml-1.5 text-purple-500 font-medium">{units.length} lô</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-medium ${traffic.color}`}>{traffic.label}</span>
          <ChevronRight size={14} className={`text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50">
          {zone.description && (
            <p className="text-xs text-gray-600 px-3 pt-2">{zone.description}</p>
          )}

          {/* Unit table */}
          {units.length > 0 && (
            <div className="px-3 pt-2 pb-3">
              <div className="text-xs font-semibold text-gray-500 mb-1.5">
                DANH SÁCH LÔ THUÊ ({units.length} lô)
              </div>
              <div className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Mã lô</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">GFA</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">NLA</th>
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Ngành hàng</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Giá thuê</th>
                    </tr>
                  </thead>
                  <tbody>
                    {units.map((u, i) => (
                      <tr key={i} className={i % 2 === 0 ? '' : 'bg-gray-50/50'}>
                        <td className="px-2 py-1 font-mono font-semibold text-gray-800">{u.code}</td>
                        <td className="px-2 py-1 text-right text-gray-600">{u.areaGFA}m²</td>
                        <td className="px-2 py-1 text-right text-gray-400">{u.areaNLA ?? Math.round(u.areaGFA * 0.85)}m²</td>
                        <td className="px-2 py-1 text-gray-600 max-w-[80px] truncate">{u.category}</td>
                        <td className="px-2 py-1 text-right text-gray-700 font-medium">{fmtRent(u.baseRentPerSqm)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {units.length === 0 && zone.suggestedRentRange && (
            <div className="px-3 pb-3 pt-1 text-xs text-gray-900 font-medium">
              Giá thuê đề xuất: {zone.suggestedRentRange}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Analysis Result ──────────────────────────────────────────────────────────

function AnalysisResult({ analysis }: { analysis: Analysis }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setSelectedMall } = useMallStore();
  const [activeFloor, setActiveFloor] = useState<string>('');
  const [applyResult, setApplyResult] = useState<{ createdFloors: number; createdZones: number; createdUnits: number } | null>(null);
  const data = analysis.analysis;

  useEffect(() => {
    if (data?.floors?.length && !activeFloor) {
      setActiveFloor(data.floors[0].level);
    }
  }, [data, activeFloor]);

  const applyMutation = useMutation({
    mutationFn: () => floorPlanApi.apply(analysis.id),
    onSuccess: (res) => {
      const result = res?.data ?? res;
      setApplyResult({ createdFloors: result.createdFloors ?? 0, createdZones: result.createdZones ?? 0, createdUnits: result.createdUnits ?? 0 });
      // Invalidate both the list and the detail so appliedAt updates
      qc.invalidateQueries({ queryKey: ['floor-plan-analyses'] });
      qc.invalidateQueries({ queryKey: ['floor-plan-analysis', analysis.id] });
      // Invalidate spaces so Mặt bằng page shows new floors/zones immediately
      qc.invalidateQueries({ queryKey: ['floors'] });
      qc.invalidateQueries({ queryKey: ['zones'] });
      toast({ title: result.message ?? 'Đã áp dụng thành công' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi khi áp dụng', variant: 'destructive' }),
  });

  if (!data) return null;

  const activeFloorData = data.floors.find((f) => f.level === activeFloor);

  return (
    <div className="space-y-5">
      {/* Mall overview */}
      {(() => {
        const totalZones = data.floors.reduce((s: number, f: FloorData) => s + (f.zones?.length ?? 0), 0);
        const totalUnits = data.floors.reduce((s: number, f: FloorData) =>
          s + f.zones.reduce((sz: number, z: FloorZone) => sz + (z.units?.length ?? 0), 0), 0);
        const totalArea = data.floors.reduce((s: number, f: FloorData) =>
          s + f.zones.reduce((sz: number, z: FloorZone) =>
            sz + (z.units ?? []).reduce((su: number, u: FloorUnit) => su + (u.areaGFA ?? 0), 0), 0), 0);
        return (
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-gray-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-gray-700">{data.mall.totalFloors}</div>
              <div className="text-xs text-gray-500 mt-0.5">Tầng</div>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-blue-700">{totalZones}</div>
              <div className="text-xs text-blue-500 mt-0.5">Khu vực</div>
            </div>
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-purple-700">{totalUnits}</div>
              <div className="text-xs text-purple-500 mt-0.5">Lô thuê</div>
            </div>
            <div className="bg-green-50 rounded-xl p-3 text-center">
              <div className="text-xl font-bold text-green-700">
                {totalArea > 1000 ? `${(totalArea / 1000).toFixed(1)}k` : totalArea}
              </div>
              <div className="text-xs text-green-500 mt-0.5">m² GFA</div>
            </div>
          </div>
        );
      })()}

      {/* Detected features */}
      {data.mall.detectedFeatures?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <Map size={12} /> ĐẶC ĐIỂM NHẬN DIỆN
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.mall.detectedFeatures.map((f, i) => (
              <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{f}</span>
            ))}
          </div>
        </div>
      )}

      {/* Floor tabs */}
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
          <Layers size={12} /> PHÂN TÍCH THEO TẦNG
        </div>
        <div className="flex gap-1.5 overflow-x-auto pb-1 mb-3">
          {data.floors.map((f) => (
            <button
              key={f.level}
              onClick={() => setActiveFloor(f.level)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                activeFloor === f.level
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.level}
            </button>
          ))}
        </div>

        {activeFloorData && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-medium text-gray-900 text-sm">{activeFloorData.name}</span>
                <span className="text-xs text-gray-400 ml-2">
                  ~{activeFloorData.estimatedArea?.toLocaleString()} m² · {activeFloorData.zones?.length ?? 0} khu vực
                </span>
              </div>
            </div>
            {activeFloorData.highlight && (
              <div className="text-xs text-gray-700 bg-gray-50 px-3 py-1.5 rounded-lg mb-3">
                ✦ {activeFloorData.highlight}
              </div>
            )}
            <div className="space-y-2">
              {activeFloorData.zones?.map((zone) => (
                <ZoneCard key={zone.code} zone={zone} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Insights */}
      {data.insights && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 flex items-center gap-1">
            <Lightbulb size={12} /> PHÂN TÍCH CHIẾN LƯỢC
          </div>

          {data.insights.trafficFlow && (
            <div className="p-3 bg-gray-50 rounded-xl">
              <div className="text-xs font-medium text-gray-700 mb-1">Luồng khách hàng</div>
              <p className="text-xs text-gray-700">{data.insights.trafficFlow}</p>
            </div>
          )}

          {data.insights.tenantMixRecommendation && (
            <div className="p-3 bg-green-50 rounded-xl">
              <div className="text-xs font-medium text-green-700 mb-1 flex items-center gap-1">
                <BarChart3 size={12} /> Cơ cấu ngành hàng đề xuất
              </div>
              <p className="text-xs text-green-600">{data.insights.tenantMixRecommendation}</p>
            </div>
          )}

          {data.insights.keyFindings?.length > 0 && (
            <div className="p-3 bg-amber-50 rounded-xl">
              <div className="text-xs font-medium text-amber-700 mb-2">Phát hiện quan trọng</div>
              <ul className="space-y-1">
                {data.insights.keyFindings.map((f, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-amber-700">
                    <span className="shrink-0 mt-0.5">•</span>{f}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {data.insights.optimizationTips?.length > 0 && (
            <div className="p-3 bg-purple-50 rounded-xl">
              <div className="text-xs font-medium text-purple-700 mb-2">Gợi ý tối ưu hóa</div>
              <ul className="space-y-1">
                {data.insights.optimizationTips.map((t, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-purple-700">
                    <span className="shrink-0 font-bold">{i + 1}.</span>{t}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Zone suggestions table */}
      {data.zoneSuggestions?.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 mb-2 flex items-center gap-1">
            <TrendingUp size={12} /> ĐỀ XUẤT ƯU TIÊN
          </div>
          <div className="space-y-2">
            {data.zoneSuggestions.slice(0, 7).map((s, i) => {
              const cat = CATEGORY_CFG[s.category] ?? CATEGORY_CFG.MIXED;
              const pri = PRIORITY_CFG[s.priority] ?? PRIORITY_CFG.MEDIUM;
              return (
                <div key={i} className="flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl">
                  <div className="shrink-0 w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center text-xs font-bold text-gray-600">
                    {s.floor}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900">{s.code}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${cat.bg} ${cat.color}`}>{cat.label}</span>
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${pri.color}`}>{pri.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{s.reason}</p>
                    {s.suggestedRentRange && (
                      <div className="text-xs text-gray-900 font-medium mt-0.5">{s.suggestedRentRange}</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Apply button */}
      {!analysis.appliedAt && !applyResult ? (
        <Button
          className="w-full gap-2"
          onClick={() => applyMutation.mutate()}
          disabled={applyMutation.isPending}
        >
          <CheckCheck size={15} />
          {applyMutation.isPending ? 'Đang áp dụng...' : 'Áp dụng vào Hệ thống (Tạo tầng & khu vực)'}
        </Button>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700">
            <CheckCircle size={16} className="text-green-500 shrink-0" />
            <div className="flex-1">
              {applyResult ? (
                <span>Đã tạo <strong>{applyResult.createdFloors} tầng</strong>, <strong>{applyResult.createdZones} khu vực</strong>, <strong>{applyResult.createdUnits} lô thuê</strong> vào hệ thống</span>
              ) : (
                <span>Đã áp dụng vào hệ thống lúc {new Date(analysis.appliedAt!).toLocaleString('vi-VN')}</span>
              )}
            </div>
          </div>
          <Button
            variant="outline"
            className="w-full gap-2 text-gray-700"
            onClick={() => {
              setSelectedMall(analysis.mall.id, analysis.mall.name);
              navigate('/spaces');
            }}
          >
            <ArrowRight size={15} />
            Xem trong Mặt bằng ({analysis.mall.name})
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Floor Plan Tab ───────────────────────────────────────────────────────────

function FloorPlanTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectedMallId, setSelectedMallId] = useState('');
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const { data: mallsData, isError: mallsError, refetch: refetchMalls } = useQuery({ queryKey: ['malls'], queryFn: spacesApi.listMalls });
  const malls: { id: string; name: string; code: string }[] = mallsData?.data ?? mallsData ?? [];

  useEffect(() => {
    if (malls.length > 0 && !selectedMallId) setSelectedMallId(malls[0].id);
  }, [malls, selectedMallId]);

  const { data: analysesData, isError: analysesError, refetch: refetchAnalyses } = useQuery({
    queryKey: ['floor-plan-analyses', selectedMallId],
    queryFn: () => floorPlanApi.listAnalyses(selectedMallId),
    enabled: !!selectedMallId,
  });
  const analyses: Analysis[] = analysesData?.data ?? analysesData ?? [];

  const { data: selectedAnalysis, refetch: refetchSelected } = useQuery({
    queryKey: ['floor-plan-analysis', selectedAnalysisId],
    queryFn: () => floorPlanApi.getAnalysis(selectedAnalysisId!),
    enabled: !!selectedAnalysisId,
    select: (r) => r?.data ?? r,
  });

  // Poll pending analysis
  const { data: pollData } = useQuery({
    queryKey: ['floor-plan-status', pendingId],
    queryFn: () => floorPlanApi.pollStatus(pendingId!),
    enabled: !!pendingId,
    refetchInterval: 2500,
    select: (r) => r?.data ?? r,
  });

  useEffect(() => {
    if (pollData?.status === 'COMPLETED' || pollData?.status === 'FAILED') {
      setPendingId(null);
      refetchAnalyses();
      if (selectedAnalysisId) refetchSelected();
      if (pollData.status === 'COMPLETED') {
        toast({ title: 'Phân tích AI hoàn thành!' });
        setSelectedAnalysisId(pollData.id);
      } else {
        toast({ title: 'Phân tích thất bại', variant: 'destructive' });
      }
    }
  }, [pollData, refetchAnalyses, refetchSelected, selectedAnalysisId, toast]);

  const uploadMutation = useMutation({
    mutationFn: (file: File) => floorPlanApi.analyze(file, selectedMallId),
    onSuccess: (res) => {
      const id = res?.id ?? res?.data?.id;
      setPendingId(id);
      setSelectedAnalysisId(id);
      qc.invalidateQueries({ queryKey: ['floor-plan-analyses'] });
      toast({ title: 'Đã tải lên! AI đang phân tích...' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi tải file', variant: 'destructive' }),
  });

  const handleFile = useCallback((file: File) => {
    if (!selectedMallId) { toast({ title: 'Vui lòng chọn mall trước', variant: 'destructive' }); return; }
    uploadMutation.mutate(file);
  }, [selectedMallId, uploadMutation, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const isPending = !!pendingId;

  return (
    <div className="flex h-full flex-col gap-4 lg:flex-row">
      {/* Left panel: upload + history */}
      <div className="flex max-h-72 w-full shrink-0 flex-col gap-4 overflow-y-auto lg:max-h-none lg:w-72">
        {mallsError && (
          <AsyncState isLoading={false} isError onRetry={refetchMalls} errorTitle="Không thể tải danh sách trung tâm thương mại"><div /></AsyncState>
        )}
        {/* Mall selector */}
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">THISO Mall</label>
          <select
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={selectedMallId}
            onChange={(e) => setSelectedMallId(e.target.value)}
          >
            {malls.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>

        {/* Upload area */}
        <div
          className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors ${
            dragging ? 'border-blue-400 bg-gray-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
          } ${isPending || uploadMutation.isPending ? 'opacity-50 pointer-events-none' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            accept=".pdf,.jpg,.jpeg,.png,.webp"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }}
          />
          <Upload size={24} className="mx-auto mb-2 text-gray-400" />
          <p className="text-sm font-medium text-gray-700">Upload bản vẽ</p>
          <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG — max 50MB</p>
          {(uploadMutation.isPending || isPending) && (
            <div className="flex items-center justify-center gap-1.5 mt-2 text-gray-700 text-xs">
              <RefreshCw size={12} className="animate-spin" /> Đang xử lý...
            </div>
          )}
        </div>

        {/* History list */}
        {analyses.length > 0 && (
          <div>
            <div className="text-xs font-semibold text-gray-500 mb-2">LỊCH SỬ PHÂN TÍCH</div>
            <div className="space-y-1.5">
              {analyses.map((a) => {
                const st = STATUS_CFG[a.status] ?? STATUS_CFG.PENDING;
                return (
                  <button
                    key={a.id}
                    onClick={() => setSelectedAnalysisId(a.id)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors ${
                      selectedAnalysisId === a.id
                        ? 'border-gray-300 bg-gray-50'
                        : 'border-gray-100 hover:border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <FileText size={13} className="text-gray-400 shrink-0" />
                      <span className="text-xs font-medium text-gray-700 truncate">{a.fileName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${st.color}`}>
                        {st.icon}
                        <span>{st.label}</span>
                      </div>
                      <span className="text-xs text-gray-400">v{a.version}</span>
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {new Date(a.createdAt).toLocaleDateString('vi-VN')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {analysesError ? (
          <AsyncState isLoading={false} isError onRetry={refetchAnalyses} errorTitle="Không thể tải lịch sử phân tích"><div /></AsyncState>
        ) : analyses.length === 0 && !uploadMutation.isPending && (
          <div className="text-center py-6 text-gray-400">
            <Map size={32} className="mx-auto mb-2 opacity-20" />
            <p className="text-xs">Chưa có phân tích nào<br />Upload bản vẽ để bắt đầu</p>
          </div>
        )}
      </div>

      {/* Right panel: analysis result */}
      <div className="flex-1 overflow-y-auto">
        {isPending && (
          <div className="flex flex-col items-center justify-center h-64 gap-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-gray-200 rounded-full animate-spin border-t-blue-500" />
              <Bot size={20} className="absolute inset-0 m-auto text-gray-500" />
            </div>
            <div className="text-center">
              <div className="font-medium text-gray-800">AI đang phân tích bản vẽ...</div>
              <p className="text-sm text-gray-500 mt-1">Claude đang đọc sơ đồ và trích xuất thông tin khu vực</p>
            </div>
          </div>
        )}

        {!isPending && selectedAnalysisId && selectedAnalysis && (
          <div>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900">{selectedAnalysis.fileName}</h3>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-400">
                    {new Date(selectedAnalysis.createdAt).toLocaleString('vi-VN')} · v{selectedAnalysis.version}
                  </span>
                  {selectedAnalysis.fileSizeKb > 0 && (
                    <span className="text-xs text-gray-400">· {(selectedAnalysis.fileSizeKb / 1024).toFixed(1)} MB</span>
                  )}
                </div>
              </div>
              {(() => {
                const st = STATUS_CFG[selectedAnalysis.status] ?? STATUS_CFG.PENDING;
                return (
                  <div className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${st.color}`}>
                    {st.icon}{st.label}
                  </div>
                );
              })()}
            </div>

            {selectedAnalysis.status === 'COMPLETED' && selectedAnalysis.analysis && (
              <AnalysisResult analysis={selectedAnalysis} />
            )}

            {selectedAnalysis.status === 'FAILED' && (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-400">
                <XCircle size={32} className="text-red-400" />
                <p className="text-sm">Phân tích thất bại. Thử upload lại file.</p>
              </div>
            )}
          </div>
        )}

        {!isPending && !selectedAnalysisId && (
          <div className="flex flex-col items-center justify-center h-64 gap-4 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center">
              <Building2 size={28} className="text-gray-300" />
            </div>
            <div className="text-center">
              <p className="font-medium text-gray-600">Chưa có phân tích nào được chọn</p>
              <p className="text-sm mt-1">Upload bản vẽ hoặc chọn phân tích từ lịch sử</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main AiPage ──────────────────────────────────────────────────────────────

export default function AiPage() {
  const [tab, setTab] = useState<'chat' | 'floorplan'>('chat');

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="mb-5 flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
        <div className="bg-gradient-to-br from-blue-500 to-purple-600 p-2.5 rounded-xl">
          <Bot size={22} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900">AI Assistant</h1>
          <p className="text-sm text-gray-500">Trợ lý AI nội bộ THISO Leasing</p>
        </div>
        {/* Tab buttons */}
        <div className="flex w-full gap-0.5 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-0.5 sm:w-auto">
          <button
            onClick={() => setTab('chat')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === 'chat'
                ? 'bg-white text-gray-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Bot size={15} /> Chat AI
          </button>
          <button
            onClick={() => setTab('floorplan')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              tab === 'floorplan'
                ? 'bg-white text-gray-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Map size={15} /> Phân tích Sơ đồ
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab === 'chat' ? (
          <ChatTab />
        ) : (
          <Card className="h-full">
            <CardContent className="p-4 h-full overflow-hidden flex flex-col">
              <FloorPlanTab />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
