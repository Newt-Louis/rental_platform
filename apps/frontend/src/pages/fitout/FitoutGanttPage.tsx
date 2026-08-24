import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fitoutApi, fitoutGanttApi } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { ArrowLeft, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '@/components/ui/page-header';

function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
}

function depthOf(task: any, byId: Map<string, any>): number {
  let depth = 0;
  let cur = task;
  while (cur?.parentTaskId && byId.has(cur.parentTaskId)) {
    depth++;
    cur = byId.get(cur.parentTaskId);
    if (depth > 10) break;
  }
  return depth;
}

export default function FitoutGanttPage() {
  const { t } = useTranslation('fitout');
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', plannedStart: '', plannedEnd: '', parentTaskId: '' });
  const [percentDraft, setPercentDraft] = useState<Record<string, string>>({});

  const { data: project } = useQuery({
    queryKey: ['fitout-detail', projectId],
    queryFn: () => fitoutApi.getFitout(projectId!),
    enabled: !!projectId,
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['fitout-tasks', projectId],
    queryFn: () => fitoutGanttApi.list(projectId!),
    enabled: !!projectId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['fitout-tasks', projectId] });

  const createMutation = useMutation({
    mutationFn: () => fitoutGanttApi.create({
      projectId,
      name: form.name,
      plannedStart: form.plannedStart,
      plannedEnd: form.plannedEnd,
      parentTaskId: form.parentTaskId || undefined,
    }),
    onSuccess: () => {
      invalidate();
      setForm({ name: '', plannedStart: '', plannedEnd: '', parentTaskId: '' });
      toast({ title: t('gantt.toast.added') });
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => fitoutGanttApi.update(id, data),
    onSuccess: () => { invalidate(); toast({ title: t('gantt.toast.updated') }); },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('common.error'), variant: 'destructive' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fitoutGanttApi.remove(id),
    onSuccess: () => { invalidate(); toast({ title: t('gantt.toast.deleted') }); },
  });

  const p: any = project;
  const taskList: any[] = tasks as any[];
  const byId = new Map(taskList.map((t) => [t.id, t]));

  // Compute overall date range for the timeline
  const allDates = taskList.flatMap((t) => [t.plannedStart, t.plannedEnd, t.actualStart, t.actualEnd].filter(Boolean).map((d: string) => new Date(d).getTime()));
  const rangeStart = allDates.length ? Math.min(...allDates) : Date.now();
  const rangeEnd = allDates.length ? Math.max(...allDates) : Date.now() + 30 * 86400000;
  const rangeSpan = Math.max(rangeEnd - rangeStart, 86400000);

  const pctOf = (d: string) => ((new Date(d).getTime() - rangeStart) / rangeSpan) * 100;

  return (
    <div>
      <PageHeader className="mb-5" title={t('gantt.title')} description={p ? `${p.tenant?.brandName} — ${p.unit?.code}` : t('gantt.loading')} actions={<Button variant="outline" size="sm" className="gap-1" onClick={() => navigate('/fitout')}><ArrowLeft size={16} /> {t('common.back')}</Button>} />

      <Card className="mb-4">
        <CardHeader className="pb-2"><CardTitle className="text-base">{t('gantt.addTask')}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-5 gap-2">
            <Input className="h-9 text-sm md:col-span-2" placeholder={t('gantt.taskName')}
              value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            <Input type="date" className="h-9 text-sm" value={form.plannedStart}
              onChange={(e) => setForm((f) => ({ ...f, plannedStart: e.target.value }))} />
            <Input type="date" className="h-9 text-sm" value={form.plannedEnd}
              onChange={(e) => setForm((f) => ({ ...f, plannedEnd: e.target.value }))} />
            <select className="h-9 text-sm border border-input rounded-md px-2 bg-white"
              value={form.parentTaskId} onChange={(e) => setForm((f) => ({ ...f, parentTaskId: e.target.value }))}>
              <option value="">{t('gantt.noParent')}</option>
              {taskList.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <Button size="sm" className="mt-2 gap-1"
            disabled={!form.name.trim() || !form.plannedStart || !form.plannedEnd || createMutation.isPending}
            onClick={() => createMutation.mutate()}>
            <Plus size={14} /> {t('gantt.add')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-4">
          {isLoading ? (
            <p className="text-sm text-gray-400 text-center py-6">{t('gantt.loading')}</p>
          ) : taskList.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10 bg-gray-50 rounded-lg">{t('gantt.empty')}</p>
          ) : (
            <div className="space-y-3">
              {taskList.map((t) => {
                const depth = depthOf(t, byId);
                const left = pctOf(t.plannedStart);
                const width = Math.max(pctOf(t.plannedEnd) - left, 1);
                const draft = percentDraft[t.id] ?? String(t.percentComplete);
                return (
                  <div key={t.id} className="flex items-center gap-3">
                    <div className="w-52 shrink-0" style={{ paddingLeft: depth * 14 }}>
                      <p className="text-sm font-medium truncate flex items-center gap-1">
                        {t.name}
                        {t.isLate && <AlertTriangle size={12} className="text-red-500 shrink-0" />}
                      </p>
                      <p className="text-xs text-gray-400">{fmtDate(t.plannedStart)} → {fmtDate(t.plannedEnd)}</p>
                    </div>
                    <div className="flex-1 relative h-6 bg-gray-100 rounded">
                      <div
                        className={`absolute h-full rounded ${t.isLate ? 'bg-red-200' : 'bg-blue-200'}`}
                        style={{ left: `${left}%`, width: `${width}%` }}
                      >
                        <div
                          className={`h-full rounded ${t.isLate ? 'bg-red-500' : 'bg-blue-500'}`}
                          style={{ width: `${t.percentComplete}%` }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Input
                        type="number" min={0} max={100} className="w-14 h-7 text-xs px-1"
                        value={draft}
                        onChange={(e) => setPercentDraft((d) => ({ ...d, [t.id]: e.target.value }))}
                      />
                      <Button size="sm" variant="outline" className="h-7 text-xs px-2"
                        onClick={() => updateMutation.mutate({ id: t.id, data: { percentComplete: +draft } })}>
                        %
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-400"
                        onClick={() => deleteMutation.mutate(t.id)}>
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
