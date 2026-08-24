import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { auditLogApi, usersApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, ShieldAlert, ListChecks, AlertTriangle } from 'lucide-react';
import { AsyncState } from '@/components/ui/async-state';
import { useTranslation } from 'react-i18next';
import { roleTranslationKey } from '@/lib/erpEnumPresentation';

const ACTION_COLOR: Record<string, string> = {
  POST: 'bg-blue-100 text-gray-700',
  PATCH: 'bg-yellow-100 text-yellow-700',
  PUT: 'bg-yellow-100 text-yellow-700',
  DELETE: 'bg-red-100 text-red-700',
};

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('vi-VN');
}

function LogDetailDialog({ log, onClose }: { log: any; onClose: () => void }) {
  const { t } = useTranslation(['admin', 'common']);
  if (!log) return null;
  let payload: unknown = log.payload;
  try { payload = log.payload ? JSON.parse(log.payload) : null; } catch { /* keep raw string */ }

  return (
    <Dialog open={!!log} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-sm font-mono">{log.endpoint}</DialogTitle></DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div>Người dùng: <span className="text-gray-800 font-medium">{log.user?.fullName ?? 'Hệ thống'}</span></div>
            <div>Vai trò: <span className="text-gray-800 font-medium" title={log.user?.role}>{log.user?.role ? t(roleTranslationKey(log.user.role)) : '—'}</span></div>
            <div>Thời gian: <span className="text-gray-800 font-medium">{fmtDateTime(log.createdAt)}</span></div>
            <div>Thời lượng: <span className="text-gray-800 font-medium">{log.duration ?? '—'} ms</span></div>
            <div>IP: <span className="text-gray-800 font-medium">{log.ipAddress ?? '—'}</span></div>
            <div>Đối tượng: <span className="text-gray-800 font-medium">{log.entityType} {log.entityId ? `#${log.entityId.slice(0, 8)}` : ''}</span></div>
          </div>
          {log.status === 'ERROR' && log.errorMessage && (
            <div className="bg-red-50 text-red-700 text-xs rounded-lg p-3">{log.errorMessage}</div>
          )}
          <div>
            <div className="text-xs font-semibold text-gray-400 mb-1">DỮ LIỆU GỬI LÊN</div>
            <pre className="bg-gray-50 rounded-lg p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">
              {payload ? JSON.stringify(payload, null, 2) : '—'}
            </pre>
          </div>
        </div>
        <Button size="sm" variant="outline" className="w-full mt-2" onClick={onClose}>Đóng</Button>
      </DialogContent>
    </Dialog>
  );
}

export default function AuditLogPage() {
  const [search, setSearch] = useState('');
  const [entityType, setEntityType] = useState('');
  const [action, setAction] = useState('');
  const [status, setStatus] = useState('');
  const [userId, setUserId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['audit-logs', { search, entityType, action, status, userId, dateFrom, dateTo }],
    queryFn: () => auditLogApi.listLogs({
      search: search || undefined,
      entityType: entityType || undefined,
      action: action || undefined,
      status: status || undefined,
      userId: userId || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 50,
    }),
  });

  const { data: entityTypes } = useQuery({
    queryKey: ['audit-entity-types'],
    queryFn: () => auditLogApi.listEntityTypes(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: () => auditLogApi.getStats(),
  });

  const { data: usersData } = useQuery({
    queryKey: ['users-lite'],
    queryFn: () => usersApi.listUsers({ limit: 500 }),
    staleTime: 5 * 60 * 1000,
  });

  const logs: any[] = data?.data ?? [];
  const types: string[] = entityTypes ?? [];
  const users: any[] = usersData?.data ?? usersData ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhật ký hệ thống</h1>
          <p className="text-sm text-gray-500 mt-1">Ai đã sửa gì, khi nào — công cụ tuân thủ, chỉ ADMIN/CEO xem được</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <ListChecks className="text-gray-400" size={22} />
          <div><p className="text-xs text-gray-500">Tổng số thao tác ghi</p><p className="text-xl font-bold">{stats?.total ?? '—'}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <AlertTriangle className="text-red-400" size={22} />
          <div><p className="text-xs text-gray-500">Số lỗi ghi nhận</p><p className="text-xl font-bold text-red-600">{stats?.errorCount ?? '—'}</p></div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 flex items-center gap-3">
          <ShieldAlert className="text-gray-400" size={22} />
          <div><p className="text-xs text-gray-500">Loại đối tượng đã ghi nhận</p><p className="text-xl font-bold">{types.length}</p></div>
        </CardContent></Card>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input placeholder="Tìm endpoint / entityId..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8 h-9 text-sm" />
        </div>
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Đối tượng" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Hành động" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="POST">POST</SelectItem>
            <SelectItem value="PATCH">PATCH</SelectItem>
            <SelectItem value="PUT">PUT</SelectItem>
            <SelectItem value="DELETE">DELETE</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-32 h-9 text-sm"><SelectValue placeholder="Trạng thái" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            <SelectItem value="SUCCESS">Thành công</SelectItem>
            <SelectItem value="ERROR">Lỗi</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="w-44 h-9 text-sm"><SelectValue placeholder="Người dùng" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {users.map((u: any) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36 h-9 text-sm" />
        <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36 h-9 text-sm" />
      </div>

      {isError ? (
        <AsyncState isLoading={false} isError onRetry={refetch} errorTitle="Không thể tải nhật ký kiểm toán"><div /></AsyncState>
      ) : isLoading ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Thời gian</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Người dùng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Hành động</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Đối tượng</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Endpoint</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((l) => (
                <tr key={l.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLog(l)}>
                  <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtDateTime(l.createdAt)}</td>
                  <td className="px-4 py-3">{l.user?.fullName ?? <span className="text-gray-400">Hệ thống</span>}</td>
                  <td className="px-4 py-3"><Badge className={`${ACTION_COLOR[l.action] ?? 'bg-gray-100 text-gray-600'} border-0 text-xs`}>{l.action}</Badge></td>
                  <td className="px-4 py-3 text-gray-600">{l.entityType}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500 max-w-64 truncate">{l.endpoint}</td>
                  <td className="px-4 py-3">
                    <Badge className={`${l.status === 'ERROR' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'} border-0 text-xs`}>
                      {l.status === 'ERROR' ? 'Lỗi' : 'OK'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ShieldAlert size={40} className="mx-auto mb-2 opacity-30" />
              <p>Không có nhật ký nào khớp bộ lọc</p>
            </div>
          )}
        </div>
      )}

      <LogDetailDialog log={selectedLog} onClose={() => setSelectedLog(null)} />
    </div>
  );
}
