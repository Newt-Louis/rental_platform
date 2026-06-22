import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { crmApi, spacesApi } from '@/api';
import { useMallStore } from '@/store/mall.store';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DealTimelineSheet } from '@/components/DealTimeline';
import {
  GitBranch, Search, Clock, Building2, User, ChevronRight, Zap,
} from 'lucide-react';

const STAGE_CONFIG: Record<string, { label: string; color: string }> = {
  LEAD: { label: 'Lead', color: 'bg-gray-100 text-gray-700' },
  BOOKING: { label: 'Booking', color: 'bg-blue-100 text-blue-700' },
  PROPOSAL: { label: 'Đề xuất', color: 'bg-indigo-100 text-indigo-700' },
  APPROVAL: { label: 'Phê duyệt', color: 'bg-amber-100 text-amber-700' },
  CONTRACT: { label: 'Hợp đồng', color: 'bg-purple-100 text-purple-700' },
  WON: { label: 'Thắng', color: 'bg-green-100 text-green-700' },
};

function fmtValue(v?: number | null) {
  if (!v) return '—';
  return new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(v) + ' ₫';
}

export default function DealPipelinePage() {
  const navigate = useNavigate();
  const { selectedMallId } = useMallStore();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [timelineLead, setTimelineLead] = useState<{ id: string; brandName: string } | null>(null);

  const { data: mallsData } = useQuery({
    queryKey: ['malls'],
    queryFn: spacesApi.listMalls,
  });
  const malls: any[] = mallsData?.data ?? mallsData ?? [];
  const mallId = selectedMallId || malls[0]?.id;

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['deal-pipeline', mallId, search, stageFilter],
    queryFn: () =>
      crmApi.getDeals({
        mallId: mallId || undefined,
        search: search || undefined,
        stage: stageFilter !== 'ALL' ? stageFilter : undefined,
        limit: 100,
      }),
    select: (r: any) => r?.data ?? r,
  });

  const deals: any[] = data?.data ?? [];
  const summary = data?.summary?.stageCounts ?? {};

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <GitBranch size={24} className="text-indigo-600" />
            Deal Pipeline
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Theo dõi deal thống nhất: Lead → Booking → Đề xuất → Duyệt → Hợp đồng
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Làm mới
        </Button>
      </div>

      {/* Stage summary */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-6">
        {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
          <button
            key={key}
            type="button"
            onClick={() => setStageFilter(stageFilter === key ? 'ALL' : key)}
            className={`rounded-lg border p-3 text-left transition-all ${
              stageFilter === key ? 'border-indigo-400 ring-2 ring-indigo-100' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <p className="text-lg font-bold text-gray-900">{summary[key] ?? 0}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{cfg.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm brand, liên hệ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Giai đoạn" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả giai đoạn</SelectItem>
            {Object.entries(STAGE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Deal list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : deals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-gray-400">
            <GitBranch size={40} className="mx-auto mb-3 opacity-30" />
            <p>Không có deal nào phù hợp bộ lọc</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {deals.map((deal: any) => {
            const stageCfg = STAGE_CONFIG[deal.stage] ?? STAGE_CONFIG.LEAD;
            return (
              <Card
                key={deal.leadId}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setTimelineLead({ id: deal.leadId, brandName: deal.brandName })}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-gray-900">{deal.brandName}</span>
                        <Badge className={`border-0 text-xs ${stageCfg.color}`}>{stageCfg.label}</Badge>
                        {deal.priority === 'HOT' && (
                          <Badge className="bg-red-100 text-red-700 border-0 text-xs">HOT</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
                        {deal.contactName && (
                          <span className="flex items-center gap-1">
                            <User size={12} /> {deal.contactName}
                          </span>
                        )}
                        {deal.unitCode && (
                          <span className="flex items-center gap-1">
                            <Building2 size={12} /> {deal.unitCode}
                          </span>
                        )}
                        {deal.mall?.name && (
                          <span>{deal.mall.name}</span>
                        )}
                        {deal.assignedTo && (
                          <span>Phụ trách: {deal.assignedTo.fullName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-2 text-sm">
                        <Zap size={14} className="text-amber-500 shrink-0" />
                        <span className="text-gray-700">{deal.nextAction}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-gray-900">{fmtValue(deal.estimatedValue)}</p>
                      <p className="text-[10px] text-gray-400 mt-1 flex items-center gap-1 justify-end">
                        <Clock size={10} />
                        {new Date(deal.updatedAt).toLocaleDateString('vi-VN')}
                      </p>
                      <div className="flex gap-1 mt-2 justify-end">
                        {deal.proposal?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/proposals?id=${deal.proposal.id}`);
                            }}
                          >
                            Đề xuất
                          </Button>
                        )}
                        {deal.contract?.id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/contracts?id=${deal.contract.id}`);
                            }}
                          >
                            HĐ
                          </Button>
                        )}
                        <ChevronRight size={16} className="text-gray-300 mt-1" />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <DealTimelineSheet
        leadId={timelineLead?.id ?? null}
        brandName={timelineLead?.brandName}
        open={!!timelineLead}
        onClose={() => setTimelineLead(null)}
      />
    </div>
  );
}
