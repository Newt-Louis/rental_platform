import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/store/auth.store';
import { announcementsApi } from '@/api';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useMallStore } from '@/store/mall.store';
import { Plus, Megaphone, AlertTriangle, Wrench, Star, Tag, Clock, ChevronDown, ChevronUp, Radio } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { AsyncState } from '@/components/ui/async-state';

const CATEGORIES = [
  { key: 'MAINTENANCE', icon: Wrench, color: 'bg-yellow-100 text-yellow-700' },
  { key: 'EVENT', icon: Star, color: 'bg-purple-100 text-purple-700' },
  { key: 'POLICY', icon: Tag, color: 'bg-gray-100 text-gray-700' },
  { key: 'PROMOTION', icon: Megaphone, color: 'bg-green-100 text-green-700' },
  { key: 'EMERGENCY', icon: AlertTriangle, color: 'bg-red-100 text-red-700' },
];

const PRIORITIES = [
  { key: 'LOW', color: 'bg-gray-100 text-gray-600' },
  { key: 'NORMAL', color: 'bg-gray-100 text-gray-700' },
  { key: 'HIGH', color: 'bg-orange-100 text-orange-700' },
  { key: 'URGENT', color: 'bg-red-100 text-red-700' },
];

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function CreateAnnouncementDialog({ open, onClose, mallId }: { open: boolean; onClose: () => void; mallId: string }) {
  const { t } = useTranslation('admin');
  const qc = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm();
  const publishedAt = watch('publishedAt');

  const mutation = useMutation({
    mutationFn: (data: any) => announcementsApi.create({ ...data, mallId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements-admin'] });
      toast({ title: t('announcements.createSuccess') });
      reset();
      onClose();
    },
    onError: () => toast({ title: t('announcements.createError'), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t('announcements.createTitle')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          <div>
            <Label>{t('announcements.fields.titleLabel')}</Label>
            <Input {...register('title', { required: true })} placeholder={t('announcements.fields.titlePlaceholder')} />
            {errors.title && <p className="mt-1 text-xs text-red-600">{t('announcements.validation.titleRequired')}</p>}
          </div>
          <div>
            <Label>{t('announcements.fields.contentLabel')}</Label>
            <textarea
              {...register('content', { required: true })}
              rows={4}
              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder={t('announcements.fields.contentPlaceholder')}
            />
            {errors.content && <p className="mt-1 text-xs text-red-600">{t('announcements.validation.contentRequired')}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('announcements.fields.categoryLabel')}</Label>
              <select {...register('category', { required: true })} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map((c) => <option key={c.key} value={c.key}>{t('announcements.categories.' + c.key)}</option>)}
              </select>
            </div>
            <div>
              <Label>{t('announcements.fields.priorityLabel')}</Label>
              <select {...register('priority')} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{t('announcements.priorities.' + p.key)}</option>)}
              </select>
            </div>
            <div>
              <Label>{t('announcements.fields.publishedAtLabel')}</Label>
              <Input {...register('publishedAt')} type="datetime-local" />
            </div>
            <div>
              <Label>{t('announcements.fields.expiresAtLabel')}</Label>
              <Input {...register('expiresAt', { validate: (value) => !value || !publishedAt || new Date(value as string) > new Date(publishedAt as string) || t('announcements.validation.expiresAfterPublished') })} type="datetime-local" />
              {errors.expiresAt && <p className="mt-1 text-xs text-red-600">{String(errors.expiresAt.message)}</p>}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t('announcements.cancel')}</Button>
            <Button type="submit" disabled={mutation.isPending || !mallId}>{mutation.isPending ? t('announcements.publishing') : t('announcements.publish')}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function AnnouncementsPage() {
  const { t } = useTranslation('admin');
  const { user } = useAuthStore();
  const { selectedMallId } = useMallStore();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isTenant = user?.role === 'TENANT';
  const isStaff = !isTenant;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: isStaff ? ['announcements-admin', selectedMallId] : ['announcements', selectedMallId],
    queryFn: () => isStaff
      ? announcementsApi.listAdmin(selectedMallId || undefined)
      : announcementsApi.list(selectedMallId || undefined),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => announcementsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements-admin'] });
      toast({ title: t('announcements.deleteSuccess') });
      setDeletingId(null);
    },
    onError: (e: any) => toast({ title: e?.response?.data?.message ?? t('announcements.deleteError'), variant: 'destructive' }),
  });

  const items: any[] = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  const filtered = categoryFilter ? items.filter((a) => a.category === categoryFilter) : items;
  const now = Date.now();
  const urgentCount = items.filter((a) => a.priority === 'URGENT').length;
  const scheduledCount = items.filter((a) => new Date(a.publishedAt).getTime() > now).length;

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-xl">
        <div className="absolute -right-16 -top-20 h-52 w-52 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-blue-200"><Radio size={14} /> {t('announcements.broadcastCenter')}</div>
          <h1 className="text-2xl font-bold">{t('announcements.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-300">{t('announcements.subtitle')}</p>
        </div>
        {isStaff && (
          <Button onClick={() => setShowCreate(true)} disabled={!selectedMallId} title={!selectedMallId ? t('announcements.createDisabledHint') : undefined} className="gap-2 bg-white text-slate-900 hover:bg-blue-50">
            <Plus size={16} /> {t('announcements.create')}
          </Button>
        )}
        </div>
        <div className="relative mt-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4 text-sm">
          <div><p className="text-xs text-slate-400">{t('announcements.stats.total')}</p><p className="mt-1 text-xl font-semibold">{items.length}</p></div>
          <div><p className="text-xs text-slate-400">{t('announcements.stats.urgent')}</p><p className="mt-1 text-xl font-semibold text-rose-300">{urgentCount}</p></div>
          <div><p className="text-xs text-slate-400">{t('announcements.stats.scheduled')}</p><p className="mt-1 text-xl font-semibold text-sky-300">{scheduledCount}</p></div>
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <button
          onClick={() => setCategoryFilter('')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!categoryFilter ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
        >
          {t('announcements.filterAll')}
        </button>
        {CATEGORIES.map((c) => {
          const Icon = c.icon;
          return (
            <button
              key={c.key}
              onClick={() => setCategoryFilter(c.key === categoryFilter ? '' : c.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${categoryFilter === c.key ? `${c.color} border-current` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
            >
              <Icon size={11} /> {t('announcements.categories.' + c.key)}
            </button>
          );
        })}
      </div>

      {isError ? (
        <AsyncState isLoading={false} isError onRetry={refetch} errorTitle={t('announcements.errorLoad')}><div /></AsyncState>
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 bg-gray-100 animate-pulse rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Megaphone size={48} className="mx-auto mb-3 opacity-20" />
          <p>{t('announcements.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((ann) => {
            const cat = CATEGORIES.find((c) => c.key === ann.category);
            const pri = PRIORITIES.find((p) => p.key === ann.priority);
            const Icon = cat?.icon ?? Megaphone;
            return (
              <Card key={ann.id} className={`${ann.priority === 'URGENT' ? 'border-red-300 bg-red-50' : ann.priority === 'HIGH' ? 'border-orange-200' : ''}`}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg shrink-0 ${cat?.color ?? 'bg-gray-100 text-gray-600'}`}>
                      <Icon size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <h3 className="font-semibold text-gray-900">{ann.title}</h3>
                            {pri && (
                              <Badge className={`${pri.color} border-0 text-xs`}>{t('announcements.priorities.' + pri.key)}</Badge>
                            )}
                            {cat && (
                              <Badge variant="outline" className="text-xs">{t('announcements.categories.' + cat.key)}</Badge>
                            )}
                            {ann.mall && (
                              <span className="text-xs text-gray-400">{ann.mall.name}</span>
                            )}
                          </div>
                          <p className={`whitespace-pre-wrap text-sm leading-6 text-gray-600 ${expandedId === ann.id ? '' : 'line-clamp-2'}`}>{ann.content}</p>
                          <button className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:text-blue-900" onClick={() => setExpandedId(expandedId === ann.id ? null : ann.id)}>
                            {expandedId === ann.id ? <><ChevronUp size={12} /> {t('announcements.collapse')}</> : <><ChevronDown size={12} /> {t('announcements.expand')}</>}
                          </button>
                          <div className="flex items-center gap-3 mt-2">
                            <div className="flex items-center gap-1 text-xs text-gray-400">
                              <Clock size={11} />
                              {fmtDate(ann.publishedAt)}
                            </div>
                            {ann.expiresAt && (
                              <div className="text-xs text-gray-400">
                                {t('announcements.expiresAt')}{fmtDate(ann.expiresAt)}
                              </div>
                            )}
                            {ann.createdBy && (
                              <div className="text-xs text-gray-400">{t('announcements.createdBy')}{ann.createdBy.fullName}</div>
                            )}
                          </div>
                        </div>
                        {isStaff && (
                          deletingId === ann.id ? <div className="flex shrink-0 gap-1"><Button size="sm" variant="outline" onClick={() => setDeletingId(null)}>{t('announcements.deleteCancel')}</Button><Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={() => deleteMutation.mutate(ann.id)}>{t('announcements.deleteConfirm')}</Button></div> : <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            onClick={() => setDeletingId(ann.id)}
                          >
                            {t('announcements.delete')}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {isStaff && (
        <CreateAnnouncementDialog
          open={showCreate}
          onClose={() => setShowCreate(false)}
          mallId={selectedMallId ?? ''}
        />
      )}
    </div>
  );
}
