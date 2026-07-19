import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, approvalsApi } from '@/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Bell, CheckCheck, CheckSquare, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotificationItem {
  id: string;
  title: string;
  body: string;
  type?: string;
  entityType?: string;
  entityId?: string;
  isRead: boolean;
  createdAt: string;
}

function entityLink(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, string> = {
    PROPOSAL: `/proposals?id=${entityId}`,
    APPROVAL: '/approvals',
    CONTRACT: `/contracts?id=${entityId}`,
    INVOICE: '/billing',
    TICKET: `/tickets?id=${entityId}`,
    MAINTENANCE_SCHEDULE: '/tickets?tab=maintenance',
    MAINTENANCE_REMINDER: '/tickets?tab=maintenance',
    BOOKING: '/bookings',
    LEAD: '/crm',
  };
  return map[entityType.toUpperCase()] ?? null;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} phút trước`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function NotificationCenter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: notifications, isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: notificationsApi.list,
    enabled: open,
    select: (r: any) => (Array.isArray(r) ? r : r?.data ?? []) as NotificationItem[],
  });

  const { data: pendingApprovals } = useQuery({
    queryKey: ['approvals-pending-count'],
    queryFn: () => approvalsApi.pending(),
    enabled: open,
    select: (r: any) => {
      const items = Array.isArray(r) ? r : r?.data ?? [];
      return items.length;
    },
  });

  const markReadMutation = useMutation({
    mutationFn: notificationsApi.markRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      qc.invalidateQueries({ queryKey: ['notifications-unread'] });
    },
  });

  const handleOpenItem = (n: NotificationItem) => {
    if (!n.isRead) markReadMutation.mutate(n.id);
    const link = entityLink(n.entityType, n.entityId);
    if (link) {
      onOpenChange(false);
      navigate(link);
    }
  };

  const unreadInList = notifications?.filter((n) => !n.isRead).length ?? 0;

  return (
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-gray-500" />
          <span>Thông báo</span>
          {unreadInList > 0 && (
            <Badge className="bg-red-500 text-white border-0">{unreadInList}</Badge>
          )}
        </div>
      }
    >
      <div className="px-6 pb-6 flex flex-col h-full">
        <div className="flex items-center justify-end mb-4 shrink-0">
          {unreadInList > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
            >
              <CheckCheck size={14} />
              Đọc tất cả
            </Button>
          )}
        </div>

        {(pendingApprovals ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => {
              onOpenChange(false);
              navigate('/approvals');
            }}
            className="mb-3 flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left shrink-0"
          >
            <CheckSquare className="h-5 w-5 text-amber-600 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-amber-900">
                {pendingApprovals} phê duyệt đang chờ bạn
              </p>
              <p className="text-xs text-amber-700">Nhấn để xử lý ngay</p>
            </div>
            <ExternalLink size={14} className="text-amber-600 shrink-0" />
          </button>
        )}

        <div className="flex-1 overflow-y-auto space-y-1 min-h-0">
          {isLoading && (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}

          {!isLoading && (!notifications || notifications.length === 0) && (
            <div className="text-center py-12 text-gray-400 text-sm">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
              Không có thông báo
            </div>
          )}

          {notifications?.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => handleOpenItem(n)}
              className={cn(
                'w-full text-left p-3 rounded-lg transition-colors border',
                n.isRead
                  ? 'bg-white border-transparent hover:bg-gray-50'
                  : 'bg-blue-50/60 border-blue-100 hover:bg-blue-50',
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={cn('text-sm', !n.isRead && 'font-medium text-gray-900')}>
                  {n.title}
                </p>
                {!n.isRead && (
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>
              <p className="text-[10px] text-gray-400 mt-1">{fmtTime(n.createdAt)}</p>
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
