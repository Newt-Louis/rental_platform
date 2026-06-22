import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { crmApi } from '@/api';
import { Sheet, SheetSection } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  GitBranch, User, BookmarkCheck, FileText, CheckSquare, File, ExternalLink,
} from 'lucide-react';

interface TimelineEvent {
  type: string;
  label: string;
  status?: string;
  entityId?: string;
  entityType?: string;
  date: string;
  meta?: Record<string, unknown>;
}

const TYPE_ICON: Record<string, React.ElementType> = {
  LEAD_CREATED: User,
  LEAD_ACTIVITY: User,
  BOOKING: BookmarkCheck,
  PROPOSAL: FileText,
  APPROVAL: CheckSquare,
  CONTRACT: File,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function entityPath(entityType?: string, entityId?: string): string | null {
  if (!entityType || !entityId) return null;
  switch (entityType) {
    case 'PROPOSAL': return `/proposals?id=${entityId}`;
    case 'CONTRACT': return `/contracts?id=${entityId}`;
    case 'BOOKING': return '/bookings';
    case 'APPROVAL': return '/approvals';
    default: return null;
  }
}

export function DealTimelineSheet({
  leadId,
  brandName,
  open,
  onClose,
}: {
  leadId: string | null;
  brandName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['lead-timeline', leadId],
    queryFn: () => crmApi.getLeadTimeline(leadId!),
    enabled: open && !!leadId,
    select: (r: any) => r?.data ?? r,
  });

  const events: TimelineEvent[] = data?.events ?? [];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Deal Timeline"
      subtitle={brandName ?? data?.brandName}
    >
      <div className="px-6 pb-8">
        <SheetSection label="Trạng thái">
          <div className="flex items-center gap-2 mb-4">
            <GitBranch size={16} className="text-gray-500" />
            <Badge variant="secondary">{data?.currentStatus ?? '—'}</Badge>
          </div>
        </SheetSection>

        {isLoading && (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        )}

        {!isLoading && events.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">Chưa có sự kiện trong deal pipeline</p>
        )}

        <div className="relative space-y-0">
          {events.map((ev, idx) => {
            const Icon = TYPE_ICON[ev.type] ?? GitBranch;
            const path = entityPath(ev.entityType, ev.entityId);
            const isLast = idx === events.length - 1;

            return (
              <div key={`${ev.type}-${ev.date}-${idx}`} className="flex gap-3 pb-4">
                <div className="flex flex-col items-center">
                  <div className="p-1.5 rounded-full bg-gray-100 text-gray-600">
                    <Icon size={14} />
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1 min-h-[24px]" />}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{ev.label}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{fmtDate(ev.date)}</p>
                    </div>
                    {ev.status && (
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {ev.status}
                      </Badge>
                    )}
                  </div>
                  {path && (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0 mt-1 text-xs gap-1"
                      onClick={() => {
                        onClose();
                        navigate(path);
                      }}
                    >
                      Xem chi tiết <ExternalLink size={11} />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}
