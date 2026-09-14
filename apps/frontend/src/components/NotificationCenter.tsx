import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, approvalsApi } from '@/api';
import { Sheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Bell, CheckCheck, CheckSquare, ExternalLink, ListChecks, PartyPopper } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';
import { classifyNotification } from '@/lib/notification-classification';

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

// Routes that take an id-bearing query param and deep-link straight to that record
// (each param name matches exactly what the destination page itself reads from the URL —
// see ContractsPage/ProposalsPage/BillingPage/BookingsPage/CrmPage/FitoutPage/TicketsPage).
// Previously most entries here pointed at the bare list route with no id at all, so clicking
// a notification always landed on the general menu instead of the specific record.
function entityLink(entityType?: string, entityId?: string): string | null {
  if (!entityType) return null;
  const type = entityType.toUpperCase();
  switch (type) {
    case 'PROPOSAL':
      return entityId ? `/proposals?id=${entityId}` : '/proposals';
    case 'CONTRACT':
      return entityId ? `/contracts?id=${entityId}` : '/contracts';
    case 'INVOICE':
      return entityId ? `/billing?invoiceId=${entityId}` : '/billing';
    case 'TICKET':
      return entityId ? `/tickets?id=${entityId}` : '/tickets';
    case 'MAINTENANCE_SCHEDULE':
    case 'MAINTENANCE_REMINDER':
      return '/tickets?tab=maintenance';
    case 'BOOKING':
      return entityId ? `/bookings?id=${entityId}` : '/bookings';
    case 'LEAD':
      return entityId ? `/crm?leadId=${entityId}` : '/crm';
    case 'PERIODIC_CHARGE_ENTRY':
      return '/billing-addin';
    case 'FITOUT':
      return entityId ? `/fitout?projectId=${entityId}` : '/fitout';
    case 'FITOUT_SUBMITTAL':
      // No per-submittal deep-link exists yet (FitoutApprovalsPage lists all pending submittals
      // inline, no URL-addressable selection) — lands on that list, not the specific submittal.
      return '/fitout-approvals';
    case 'FITOUT_ISSUE':
      // No per-issue deep-link exists yet, and the notification's entityId is the Issue's own
      // id (not its parent project's), so it can't even resolve /fitout?projectId= correctly —
      // lands on the general Fitout list.
      return '/fitout';
    case 'WORK_ORDER':
    case 'WORK_ORDER_OVERDUE':
    case 'WORK_ORDER_DUE_SOON':
      return entityId ? `/work-orders?id=${entityId}` : '/work-orders';
    case 'PATROL_SHIFT':
    case 'PATROL_SHIFT_CANCELLED':
    case 'PATROL_SHIFT_OVERDUE':
    case 'PATROL_CHECK_ESCALATION':
      return entityId ? `/patrol?id=${entityId}` : '/patrol';
    case 'SERVICE_CONTRACT':
      return entityId ? `/service-contracts?id=${entityId}` : '/service-contracts';
    case 'CRM':
      return '/crm';
    default:
      // SYSTEM, TENANT, E_INVOICE, LEAD_ACTIVITY: no dedicated destination page/view exists yet.
      return null;
  }
}

function fmtTime(iso: string, t: (key: string, opts?: Record<string, unknown>) => string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return t('notifications.minutesAgo', { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t('notifications.hoursAgo', { count: diffHours });
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
  const { t } = useTranslation('admin');
  const [tab, setTab] = useState<'task' | 'notification'>('task');

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

  // Việc cần làm (Task) vs. Thông báo (Notification) — split of the single
  // Notification feed by `type`. See docs/audit/09-TASK-NOTIFICATION-CENTER.md
  // and docs/implementation/UX_DECISIONS.md DECISION-002.
  const tasks = notifications?.filter((n) => classifyNotification(n.type) === 'task') ?? [];
  const plainNotifications = notifications?.filter((n) => classifyNotification(n.type) === 'notification') ?? [];
  const unreadTasks = tasks.filter((n) => !n.isRead).length + (pendingApprovals ?? 0);
  const unreadNotifications = plainNotifications.filter((n) => !n.isRead).length;
  const totalUnread = unreadTasks + unreadNotifications;

  const renderRow = (n: NotificationItem) => (
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
      <p className="text-[10px] text-gray-400 mt-1">{fmtTime(n.createdAt, t)}</p>
    </button>
  );

  return (
    <Sheet
      open={open}
      onClose={() => onOpenChange(false)}
      title={
        <div className="flex items-center gap-2">
          <Bell size={16} className="text-gray-500" />
          <span>{t('notifications.title')}</span>
          {totalUnread > 0 && (
            <Badge className="bg-red-500 text-white border-0">{totalUnread}</Badge>
          )}
        </div>
      }
    >
      <div className="px-6 pb-6 flex flex-col h-full">
        <Tabs value={tab} onValueChange={(v) => setTab(v as 'task' | 'notification')} className="flex flex-col h-full min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <TabsList>
              <TabsTrigger value="task" className="gap-1.5">
                <ListChecks size={13} />
                {t('notifications.tabs.tasks')}
                {unreadTasks > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-red-500 text-white border-0">{unreadTasks}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="notification" className="gap-1.5">
                <Bell size={13} />
                {t('notifications.tabs.notifications')}
                {unreadNotifications > 0 && (
                  <Badge className="ml-1 h-4 min-w-4 px-1 text-[10px] bg-gray-400 text-white border-0">{unreadNotifications}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            {totalUnread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs gap-1"
                onClick={() => markAllMutation.mutate()}
                disabled={markAllMutation.isPending}
              >
                <CheckCheck size={14} />
                {t('notifications.markAllRead')}
              </Button>
            )}
          </div>

          <TabsContent value="task" className="flex-1 overflow-y-auto space-y-1 min-h-0 mt-0">
            {(pendingApprovals ?? 0) > 0 && (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  navigate('/approvals');
                }}
                className="mb-3 flex items-center gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left w-full"
              >
                <CheckSquare className="h-5 w-5 text-amber-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-900">
                    {t('notifications.pendingApprovals', { count: pendingApprovals })}
                  </p>
                  <p className="text-xs text-amber-700">{t('notifications.pendingApprovalsAction')}</p>
                </div>
                <ExternalLink size={14} className="text-amber-600 shrink-0" />
              </button>
            )}

            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {!isLoading && tasks.length === 0 && (pendingApprovals ?? 0) === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                <PartyPopper className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {t('notifications.noTasks')}
              </div>
            )}

            {tasks.map(renderRow)}
          </TabsContent>

          <TabsContent value="notification" className="flex-1 overflow-y-auto space-y-1 min-h-0 mt-0">
            {isLoading && (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            )}

            {!isLoading && plainNotifications.length === 0 && (
              <div className="text-center py-12 text-gray-400 text-sm">
                <Bell className="h-8 w-8 mx-auto mb-2 opacity-40" />
                {t('notifications.noNotifications')}
              </div>
            )}

            {plainNotifications.map(renderRow)}
          </TabsContent>
        </Tabs>
      </div>
    </Sheet>
  );
}
