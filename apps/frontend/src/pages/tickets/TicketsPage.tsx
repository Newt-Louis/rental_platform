import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ticketsApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Ticket } from 'lucide-react';
import type { Ticket as TicketType } from '@/types';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  NEW: { label: 'Mới', color: 'bg-gray-100 text-gray-700' },
  ASSIGNED: { label: 'Đã giao', color: 'bg-gray-100 text-gray-700' },
  IN_PROGRESS: { label: 'Đang xử lý', color: 'bg-yellow-100 text-yellow-700' },
  WAITING_TENANT: { label: 'Chờ KH', color: 'bg-purple-100 text-purple-700' },
  RESOLVED: { label: 'Đã giải quyết', color: 'bg-green-100 text-green-700' },
  CLOSED: { label: 'Đóng', color: 'bg-gray-200 text-gray-600' },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  LOW: { label: 'Thấp', color: 'bg-gray-100 text-gray-600' },
  MEDIUM: { label: 'Trung bình', color: 'bg-gray-100 text-gray-700' },
  HIGH: { label: 'Cao', color: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Khẩn cấp', color: 'bg-red-100 text-red-700' },
};

export default function TicketsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['tickets', { search, status, priority }],
    queryFn: () => ticketsApi.listTickets({
      search: search || undefined,
      status: status || undefined,
      priority: priority || undefined,
    }),
  });

  const { data: statsData } = useQuery({
    queryKey: ['ticket-stats'],
    queryFn: () => ticketsApi.listTickets({ limit: 1 }),
  });

  const tickets: TicketType[] = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Operation Tickets</h1>
          <p className="text-sm text-gray-500 mt-1">Yêu cầu vận hành và hỗ trợ</p>
        </div>
      </div>

      {/* Status quick filter */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {Object.entries(STATUS_MAP).map(([key, val]) => (
          <button
            key={key}
            onClick={() => setStatus(status === key ? '' : key)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium
              ${status === key ? 'border-blue-500 bg-gray-100 text-gray-700' : `${val.color} border-transparent`}`}
          >
            {val.label}
          </button>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm ticket..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={priority} onValueChange={setPriority}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Ưu tiên" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {Object.entries(PRIORITY_MAP).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-14 rounded" />)}
        </div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ticket #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Chủ đề</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Khách thuê</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Loại</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ưu tiên</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phụ trách</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ngày tạo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tickets.map((t) => {
                const st = STATUS_MAP[t.status];
                const pr = PRIORITY_MAP[t.priority];
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{t.ticketNumber}</td>
                    <td className="px-4 py-3 font-medium max-w-48 truncate">{t.subject}</td>
                    <td className="px-4 py-3 text-gray-500">{t.tenant?.brandName}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-xs">{t.type}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${pr?.color} border-0 text-xs`}>{pr?.label}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`${st?.color} border-0 text-xs`}>{st?.label}</Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{t.assignedTo?.fullName ?? '-'}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {tickets.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <Ticket size={40} className="mx-auto mb-2 opacity-30" />
              <p>Không có ticket nào</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
