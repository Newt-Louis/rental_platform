import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi, fitoutDailyReportApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Plus, Users, Calendar } from 'lucide-react';

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default function FitoutDailyReportPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [date, setDate] = useState(todayStr());
  const [form, setForm] = useState({ contractorId: '', workforceCount: '', description: '', areaTag: '' });

  const { data: project } = useQuery({
    queryKey: ['fitout-detail', projectId],
    queryFn: () => fitoutApi.getFitout(projectId!),
    enabled: !!projectId,
  });

  const { data: contractorsData = [] } = useQuery({
    queryKey: ['fitout-contractors', projectId],
    queryFn: () => fitoutApi.listContractors(projectId!),
    enabled: !!projectId,
  });
  const contractors: any[] = (contractorsData as any)?.data ?? contractorsData ?? [];

  const { data: merged, isLoading } = useQuery({
    queryKey: ['fitout-daily-report-merged', projectId, date],
    queryFn: () => fitoutDailyReportApi.getMerged(projectId!, date),
    enabled: !!projectId,
  });

  const createMutation = useMutation({
    mutationFn: () => fitoutDailyReportApi.create({
      projectId,
      reportDate: date,
      contractorId: form.contractorId || undefined,
      workforceCount: form.workforceCount ? +form.workforceCount : 0,
      description: form.description,
      areaTag: form.areaTag || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fitout-daily-report-merged', projectId, date] });
      setForm({ contractorId: '', workforceCount: '', description: '', areaTag: '' });
      toast({ title: 'Đã thêm báo cáo ngày' });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const p: any = project;

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="sm" className="gap-1" onClick={() => navigate('/fitout')}>
          <ArrowLeft size={16} /> Quay lại
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nhật ký công trường</h1>
          <p className="text-sm text-gray-500 mt-1">
            {p ? `${p.tenant?.brandName} — ${p.unit?.code}` : 'Đang tải...'}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Calendar size={16} className="text-gray-400" />
        <Input type="date" className="w-44 h-9" value={date} onChange={(e) => setDate(e.target.value)} />
        {merged && (
          <div className="flex items-center gap-4 text-sm text-gray-600 ml-4">
            <span className="flex items-center gap-1"><Users size={14} /> {merged.totalWorkforce} công nhân</span>
            <span>{merged.entryCount} mục báo cáo</span>
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-1">
          <CardHeader className="pb-2"><CardTitle className="text-base">Thêm báo cáo</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <select className="w-full text-sm h-9 border border-input rounded-md px-2 bg-white"
              value={form.contractorId} onChange={(e) => setForm((f) => ({ ...f, contractorId: e.target.value }))}>
              <option value="">Không chọn nhà thầu</option>
              {contractors.map((c: any) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
            </select>
            <Input placeholder="Khu vực (vd: Tầng trệt - khu A)" className="h-9 text-sm"
              value={form.areaTag} onChange={(e) => setForm((f) => ({ ...f, areaTag: e.target.value }))} />
            <Input type="number" placeholder="Số công nhân" className="h-9 text-sm"
              value={form.workforceCount} onChange={(e) => setForm((f) => ({ ...f, workforceCount: e.target.value }))} />
            <textarea
              className="w-full text-sm border border-input rounded-md px-2 py-2 min-h-[80px]"
              placeholder="Mô tả công việc trong ngày..."
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
            <Button size="sm" className="w-full gap-1"
              disabled={!form.description.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}>
              <Plus size={14} /> Thêm báo cáo
            </Button>
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base">Tổng hợp theo khu vực — {date}</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-gray-400 text-center py-6">Đang tải...</p>
            ) : !merged || merged.entryCount === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6 bg-gray-50 rounded-lg">Chưa có báo cáo nào cho ngày này</p>
            ) : (
              <div className="space-y-4">
                {merged.byArea.map((group: any) => (
                  <div key={group.areaTag} className="border rounded-lg p-3">
                    <p className="text-sm font-semibold text-gray-700 mb-2">{group.areaTag}</p>
                    <div className="space-y-2">
                      {group.entries.map((entry: any) => (
                        <div key={entry.id} className="flex items-start justify-between gap-2 text-sm bg-gray-50 rounded-lg p-2">
                          <div className="min-w-0">
                            <p className="text-gray-700">{entry.description}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {entry.contractor?.companyName ?? 'Nội bộ'} · {entry.createdBy?.fullName}
                            </p>
                          </div>
                          {entry.workforceCount > 0 && (
                            <Badge className="bg-gray-100 text-gray-600 border-0 text-xs shrink-0">
                              {entry.workforceCount} người
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
