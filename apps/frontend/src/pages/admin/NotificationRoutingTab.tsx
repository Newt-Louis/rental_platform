import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bell, Lock, Mail, RotateCcw, Send } from 'lucide-react';
import { spacesApi } from '@/api';
import {
  CATEGORY_LABEL, ELIGIBILITY_REASON_LABEL, MODE_LABEL, notificationRoutingApi,
  type NotificationRecipientType, type NotificationRoutingMode, type RoutingCandidate, type RoutingEvent,
} from '@/api/notification-routing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { useMallStore } from '@/store/mall.store';

const SELECT_CLASS = 'h-9 rounded-md border border-gray-200 bg-white px-2 text-sm';

function apiMessage(error: any, fallback: string): string {
  const msg = error?.response?.data?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  return typeof msg === 'string' && msg ? msg : fallback;
}

function CategoryBadge({ category }: { category: RoutingEvent['category'] }) {
  const style = category === 'INTERNAL_ROLE_ROUTED'
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : category === 'EXTERNAL_BUSINESS_RECIPIENT'
      ? 'bg-amber-50 text-amber-800 border-amber-200'
      : 'bg-gray-100 text-gray-600 border-gray-200';
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${style}`}>{CATEGORY_LABEL[category]}</span>;
}

/**
 * Admin screen for CR-NOTIFICATION-RECIPIENT-ROUTING. Everything shown here --
 * the events, their default rule, which modes are legal -- comes from the
 * backend registry. Saving only records CANDIDATES: the server re-checks every
 * recipient's access when the mail is actually built.
 */
export function NotificationRoutingTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { selectedMallId } = useMallStore();
  const [mallId, setMallId] = useState<string>(selectedMallId ?? '');
  const [editing, setEditing] = useState<RoutingEvent | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'' | RoutingEvent['category']>('');

  const { data: mallsData } = useQuery({ queryKey: ['malls'], queryFn: () => spacesApi.listMalls() });
  const malls: any[] = useMemo(() => (mallsData?.data ?? mallsData ?? []) as any[], [mallsData]);
  const effectiveMallId = mallId || malls[0]?.id || '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['notification-routing', effectiveMallId],
    queryFn: () => notificationRoutingApi.listEvents(effectiveMallId),
    enabled: !!effectiveMallId,
    retry: false,
  });

  const resetMutation = useMutation({
    mutationFn: (eventKey: string) => notificationRoutingApi.reset(eventKey, effectiveMallId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notification-routing', effectiveMallId] });
      toast({ title: 'Đã trả về người nhận mặc định' });
    },
    onError: (e: any) => toast({ title: 'Không đặt lại được', description: apiMessage(e, ''), variant: 'destructive' }),
  });

  const testMutation = useMutation({
    mutationFn: (eventKey: string) => notificationRoutingApi.sendTest(eventKey, effectiveMallId),
    onSuccess: (result) => toast({
      title: 'Đã gửi email kiểm thử',
      description: result.sentTo.length
        ? `Gửi tới: ${result.sentTo.map((r) => r.email).join(', ')}${result.sentTo.every((r) => r.skipped) ? ' (SMTP đang tắt — chỉ ghi nhận)' : ''}`
        : 'Không có người nhận hợp lệ',
    }),
    onError: (e: any) => toast({ title: 'Không gửi thử được', description: apiMessage(e, ''), variant: 'destructive' }),
  });

  if (isError) {
    return (
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        {(error as any)?.response?.status === 403
          ? 'Bạn không có quyền cấu hình người nhận thông báo của Mall này.'
          : apiMessage(error, 'Không tải được danh mục thông báo.')}
      </div>
    );
  }

  const term = search.trim().toLowerCase();
  const visible = (data?.items ?? []).filter((item) => {
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (!term) return true;
    return [item.displayNameVi, item.eventKey, item.descriptionVi].some((v) => v.toLowerCase().includes(term));
  });

  const groups: Array<[RoutingEvent['category'], string]> = [
    ['INTERNAL_ROLE_ROUTED', 'Thông báo nội bộ — có thể đổi người nhận'],
    ['EXTERNAL_BUSINESS_RECIPIENT', 'Gửi khách / đối tác — chỉ thêm bản sao nội bộ'],
    ['WORKFLOW_APPROVER', 'Theo quy trình phê duyệt — không cấu hình tại đây'],
  ];

  return (
    <div className="space-y-4" data-testid="notification-routing-tab">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 font-semibold"><Bell size={16} className="text-gray-400" /> Thông báo & Người nhận</h3>
        <select className={SELECT_CLASS} value={effectiveMallId} onChange={(e) => setMallId(e.target.value)} aria-label="Chọn Mall">
          {malls.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <p className="text-xs text-gray-500">
          Cấu hình chỉ chọn <strong>ứng viên</strong> nhận thư. Khi gửi, hệ thống vẫn kiểm tra lại quyền truy cập Mall và dữ liệu của từng người.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Tìm theo tên, mã sự kiện hoặc mô tả"
          aria-label="Tìm sự kiện"
          className="w-full sm:max-w-sm"
        />
        <select
          className={SELECT_CLASS}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as any)}
          aria-label="Lọc theo nhóm"
        >
          <option value="">Tất cả nhóm</option>
          <option value="INTERNAL_ROLE_ROUTED">{CATEGORY_LABEL.INTERNAL_ROLE_ROUTED}</option>
          <option value="EXTERNAL_BUSINESS_RECIPIENT">{CATEGORY_LABEL.EXTERNAL_BUSINESS_RECIPIENT}</option>
          <option value="WORKFLOW_APPROVER">{CATEGORY_LABEL.WORKFLOW_APPROVER}</option>
        </select>
        {!isLoading && <span className="text-xs text-gray-400">{visible.length} sự kiện</span>}
      </div>

      {!isLoading && visible.length === 0 && (
        <p className="rounded-xl border border-gray-200 p-6 text-center text-sm text-gray-400">Không có sự kiện nào khớp bộ lọc.</p>
      )}

      {isLoading && <div className="h-40 animate-pulse rounded-xl bg-gray-100" />}

      {!isLoading && groups.map(([category, title]) => {
        const items = visible.filter((i) => i.category === category);
        if (items.length === 0) return null;
        return (
          <section key={category} className="rounded-xl border border-gray-200">
            <header className="border-b border-gray-100 bg-gray-50 px-3 py-2 text-xs font-semibold tracking-wider text-gray-600">{title}</header>
            <div className="divide-y divide-gray-100">
              {items.map((event) => (
                <article key={event.eventKey} className="p-3" data-event={event.eventKey}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{event.displayNameVi}</span>
                        <CategoryBadge category={event.category} />
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">{MODE_LABEL[event.mode]}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500">{event.descriptionVi}</p>
                      <p className="mt-1 text-xs text-gray-700">
                        <span className="text-gray-500">Mặc định: </span>{event.defaultRecipientRuleVi}
                      </p>
                      {event.recipients.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5">
                          {event.recipients.map((r) => (
                            <li
                              key={`${r.userId}-${r.recipientType}`}
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${r.eligible ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-700'}`}
                              title={r.eligible ? r.email : r.reasonCodes.map((c) => ELIGIBILITY_REASON_LABEL[c] ?? c).join('; ')}
                            >
                              {r.recipientType === 'CC' && <span className="text-[10px] font-semibold">CC</span>}
                              {r.fullName}
                              {!r.eligible && <AlertTriangle size={11} />}
                            </li>
                          ))}
                        </ul>
                      )}
                      {event.mode !== 'DEFAULT' ? (
                        <p className="mt-1 text-[11px] text-gray-400">
                          Sửa lần cuối: {event.updatedAt ? new Date(event.updatedAt).toLocaleString('vi-VN') : '—'}
                          {event.updatedById ? ` · ${event.updatedById}` : ''}
                        </p>
                      ) : (
                        event.configurable && <p className="mt-1 text-[11px] text-gray-400">Chưa cấu hình — đang dùng quy tắc mặc định</p>
                      )}
                      {event.category === 'WORKFLOW_APPROVER' && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500">
                          <Lock size={11} /> Người nhận theo Chính sách phê duyệt — sửa tại tab “Chính sách phê duyệt”.
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {event.configurable && (
                        <>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(event)}>Sửa</Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                            disabled={testMutation.isPending}
                            onClick={() => testMutation.mutate(event.eventKey)}
                          >
                            <Send size={11} /> Gửi thử
                          </Button>
                          {event.mode !== 'DEFAULT' && (
                            <Button
                              size="sm" variant="ghost" className="h-7 gap-1 text-xs text-red-600"
                              disabled={resetMutation.isPending}
                              onClick={() => resetMutation.mutate(event.eventKey)}
                            >
                              <RotateCcw size={11} /> Mặc định
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        );
      })}

      {editing && (
        <EditRoutingDialog
          event={editing}
          mallId={effectiveMallId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ['notification-routing', effectiveMallId] });
            toast({ title: 'Đã lưu người nhận' });
          }}
        />
      )}
    </div>
  );
}

function EditRoutingDialog({
  event, mallId, onClose, onSaved,
}: { event: RoutingEvent; mallId: string; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [mode, setMode] = useState<NotificationRoutingMode>(event.mode);
  const [picked, setPicked] = useState<Record<string, NotificationRecipientType>>(
    Object.fromEntries(event.recipients.map((r) => [r.userId, r.recipientType])),
  );
  const { data: candidates = [], isLoading } = useQuery<RoutingCandidate[]>({
    queryKey: ['notification-routing-candidates', event.eventKey, mallId],
    queryFn: () => notificationRoutingApi.candidates(event.eventKey, mallId),
  });

  // Group B can only add copies, so every picked user is a CC there.
  const ccOnly = event.category === 'EXTERNAL_BUSINESS_RECIPIENT';
  const recipientType: NotificationRecipientType = ccOnly || mode === 'DEFAULT_PLUS_CC' ? 'CC' : 'TO';
  const selected = Object.keys(picked);
  const needsRecipients = mode !== 'DEFAULT';

  const save = useMutation({
    mutationFn: () => notificationRoutingApi.upsert(event.eventKey, mallId, {
      mode,
      recipients: mode === 'DEFAULT' ? [] : selected.map((userId) => ({ userId, recipientType })),
      expectedVersion: event.version ?? undefined,
    }),
    onSuccess: onSaved,
    onError: (e: any) => toast({ title: 'Không lưu được', description: apiMessage(e, 'Vui lòng thử lại'), variant: 'destructive' }),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event.displayNameVi}</DialogTitle>
          <DialogDescription>
            Mặc định: {event.defaultRecipientRuleVi}. Người được chọn vẫn phải có quyền xem dữ liệu của sự kiện tại thời điểm gửi.
          </DialogDescription>
        </DialogHeader>

        <label className="block text-xs font-medium text-gray-600">
          Chế độ
          <select
            className={`${SELECT_CLASS} mt-1 w-full`}
            value={mode}
            onChange={(e) => setMode(e.target.value as NotificationRoutingMode)}
            aria-label="Chế độ định tuyến"
          >
            {event.allowedModes.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
        </label>
        {ccOnly && (
          <p className="flex items-center gap-1 text-xs text-amber-700">
            <Mail size={12} /> Người nhận chính là địa chỉ trên hồ sơ khách/đối tác và không thể thay đổi.
          </p>
        )}

        {needsRecipients && (
          <div className="rounded-lg border border-gray-200">
            <div className="border-b border-gray-100 px-2 py-1.5 text-xs font-medium text-gray-600">
              Chọn người nhận {recipientType === 'CC' ? '(bản sao)' : '(chính)'}
            </div>
            <div className="max-h-64 overflow-y-auto p-2">
              {isLoading && <div className="h-16 animate-pulse rounded bg-gray-100" />}
              {!isLoading && candidates.length === 0 && <p className="p-2 text-xs text-gray-400">Không có người dùng phù hợp trong Mall này.</p>}
              {candidates.map((c) => (
                <label key={c.id} className={`flex items-center gap-2 rounded px-1.5 py-1 text-sm ${c.eligible ? '' : 'opacity-60'}`}>
                  <Checkbox
                    checked={!!picked[c.id]}
                    disabled={!c.eligible}
                    onCheckedChange={(v) => setPicked((prev) => {
                      const next = { ...prev };
                      if (v === true) next[c.id] = recipientType; else delete next[c.id];
                      return next;
                    })}
                    aria-label={c.fullName}
                  />
                  <span className="flex-1">
                    {c.fullName} <span className="text-xs text-gray-400">({c.role})</span>
                    {!c.eligible && (
                      <span className="ml-1 text-xs text-red-600">
                        {c.reasonCodes.map((r) => ELIGIBILITY_REASON_LABEL[r] ?? r).join('; ')}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {needsRecipients && selected.length === 0 && (
          <p className="text-xs text-red-600">Cần ít nhất một người nhận. Muốn quay về mặc định thì chọn chế độ “{MODE_LABEL.DEFAULT}”.</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Quay lại</Button>
          <Button disabled={save.isPending || (needsRecipients && selected.length === 0)} onClick={() => save.mutate()}>
            {save.isPending ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
