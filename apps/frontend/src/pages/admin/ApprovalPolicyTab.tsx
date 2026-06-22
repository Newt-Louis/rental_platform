import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { approvalsApi } from '@/api';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, RefreshCw } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  LEASING_MANAGER: 'Leasing Manager',
  MALL_DIRECTOR: 'Mall Director',
  CEO: 'CEO',
  FINANCE: 'Finance',
  LEGAL: 'Legal',
};

export function ApprovalPolicyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: '', name: '', stepName: '', stepOrder: 10, approverRole: 'LEASING_MANAGER',
    conditionType: 'DISCOUNT_PCT', operator: '>', threshold: 5, isRequired: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['approval-policy-rules'],
    queryFn: approvalsApi.listPolicyRules,
  });

  const createMutation = useMutation({
    mutationFn: () => approvalsApi.createPolicyRule({
      ...form,
      stepOrder: +form.stepOrder,
      threshold: +form.threshold,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approval-policy-rules'] });
      toast({ title: 'Đã tạo rule' });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? 'Lỗi', variant: 'destructive' }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      approvalsApi.updatePolicyRule(id, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['approval-policy-rules'] }),
  });

  const rules: any[] = data?.data ?? data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">Approval Policy Rules</h2>
          <p className="text-xs text-gray-500">Cấu hình quy trình phê duyệt proposal theo rule data-driven</p>
        </div>
        <Button size="sm" className="gap-1" onClick={() => setOpen(true)}>
          <Plus size={14} /> Thêm rule
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Bước</th>
                <th className="text-left px-3 py-2">Role</th>
                <th className="text-left px-3 py-2">Điều kiện</th>
                <th className="text-left px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rules.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2">{r.stepOrder}. {r.stepName}</td>
                  <td className="px-3 py-2">{ROLE_LABELS[r.approverRole] ?? r.approverRole}</td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {r.isRequired ? 'Bắt buộc' : `${r.conditionType} ${r.operator ?? ''} ${r.threshold ?? r.matchValue ?? ''}`}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={r.isActive ? 'bg-green-100 text-green-700 border-0' : 'bg-gray-100 text-gray-500 border-0'}>
                      {r.isActive ? 'Active' : 'Off'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => toggleMutation.mutate({ id: r.id, isActive: !r.isActive })}
                    >
                      {r.isActive ? 'Tắt' : 'Bật'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Thêm approval rule</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {['code', 'name', 'stepName'].map((f) => (
              <div key={f}>
                <Label>{f}</Label>
                <Input value={(form as any)[f]} onChange={(e) => setForm({ ...form, [f]: e.target.value })} />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>stepOrder</Label><Input type="number" value={form.stepOrder} onChange={(e) => setForm({ ...form, stepOrder: +e.target.value })} /></div>
              <div><Label>threshold</Label><Input type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: +e.target.value })} /></div>
            </div>
            <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
              {createMutation.isPending ? <RefreshCw className="animate-spin" size={14} /> : null} Lưu
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
