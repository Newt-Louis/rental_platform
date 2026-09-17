import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, Send } from 'lucide-react';
import { proposalsApi } from '@/api';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { proposalErrorMessage } from '@/pages/proposals/proposalPdf';

/**
 * CR-PROPOSAL-DOCUMENT-FINALIZATION — sending an approved Tờ trình outside the
 * company. Nothing is sent until the user presses Gửi: suggested contacts are
 * offered, not filled in, and the dialog states exactly which version and file
 * will go out. One idempotency key per dialog opening, so a double click or a
 * retry after a timeout cannot send twice.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseEmails(value: string) {
  return value.split(/[,;\s]+/).map((v) => v.trim()).filter(Boolean);
}

function newIdempotencyKey() {
  const random = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `send-${random}`;
}

const DELIVERY_LABEL: Record<string, string> = {
  PENDING: 'Đang chờ gửi',
  SENDING: 'Đang gửi',
  SENT: 'Đã gửi',
  FAILED: 'Gửi lỗi',
  SKIPPED: 'Không gửi (email đang tắt)',
};

export function SendProposalDocumentDialog({ proposalId, proposalNumber, open, onClose }: {
  proposalId: string;
  proposalNumber: string;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: context, isLoading } = useQuery({
    queryKey: ['proposal-send-context', proposalId],
    queryFn: () => proposalsApi.getSendContext(proposalId),
    enabled: open,
  });
  const { data: history = [] } = useQuery({
    queryKey: ['proposal-sends', proposalId],
    queryFn: () => proposalsApi.listSends(proposalId),
    enabled: open,
  });

  const [versionId, setVersionId] = useState('');
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const keyRef = useRef(newIdempotencyKey());

  useEffect(() => {
    if (!open) return;
    keyRef.current = newIdempotencyKey();
    setTo(''); setCc(''); setMessage('');
  }, [open]);

  useEffect(() => {
    if (!context) return;
    setVersionId((v) => v || context.approvedVersions[0]?.id || '');
    setSubject((s) => s || context.defaultSubject || '');
  }, [context]);

  const version = useMemo(() => context?.approvedVersions.find((v) => v.id === versionId), [context, versionId]);
  const toList = parseEmails(to);
  const ccList = parseEmails(cc);
  const invalid = [...toList, ...ccList].filter((e) => !EMAIL.test(e));

  const sendMutation = useMutation({
    mutationFn: () => proposalsApi.sendDocument(proposalId, {
      documentVersionId: versionId,
      to: toList,
      ...(ccList.length ? { cc: ccList } : {}),
      ...(subject.trim() ? { subject: subject.trim() } : {}),
      ...(message.trim() ? { message: message.trim() } : {}),
    }, keyRef.current),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['proposal-sends', proposalId] });
      toast({ title: result.duplicate ? 'Tờ trình này đã được gửi với cùng yêu cầu' : 'Đã đưa tờ trình vào hàng đợi gửi' });
      onClose();
    },
    onError: (error) => toast({ title: proposalErrorMessage(error, 'Không gửi được tờ trình'), variant: 'destructive' }),
  });

  const addSuggestion = (email: string) => {
    if (!toList.map((e) => e.toLowerCase()).includes(email.toLowerCase())) setTo([...toList, email].join(', '));
  };

  const canSubmit = !!context?.canSend && !!version && toList.length > 0 && invalid.length === 0 && !sendMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Gửi tờ trình {proposalNumber}</DialogTitle></DialogHeader>
        {isLoading && <p className="text-sm text-slate-500">Đang tải…</p>}
        {context && !context.canSend && (
          <p role="alert" className="text-sm text-red-700">Bạn không có quyền gửi tờ trình ra bên ngoài.</p>
        )}
        {context?.canSend && !context.approvedVersions.length && (
          <p role="alert" className="text-sm text-amber-800">Chưa có phiên bản tờ trình nào được phê duyệt để gửi.</p>
        )}
        {context?.canSend && !!context.approvedVersions.length && (
          <div className="space-y-3 text-sm">
            <label className="block text-xs font-medium text-slate-600">
              Phiên bản tờ trình
              <select aria-label="Phiên bản tờ trình" value={versionId} onChange={(e) => setVersionId(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm">
                {context.approvedVersions.map((v) => (
                  <option key={v.id} value={v.id}>Phiên bản {v.versionNumber} · trình ngày {new Date(v.submittedAt).toLocaleDateString('vi-VN')}</option>
                ))}
              </select>
            </label>
            {version && (
              <p data-testid="send-attachment" className="flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-700">
                <Paperclip size={12} /> Tệp đính kèm: <strong>{version.attachmentFilename}</strong>
              </p>
            )}
            <label className="block text-xs font-medium text-slate-600">
              Người nhận
              <input aria-label="Người nhận" value={to} onChange={(e) => setTo(e.target.value)} placeholder="email@congty.vn, …" className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            {!!context.suggestedRecipients.length && (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <span className="text-slate-500">Gợi ý:</span>
                {context.suggestedRecipients.map((r) => (
                  <button key={r.email} type="button" onClick={() => addSuggestion(r.email)} className="rounded-full border px-2 py-0.5 hover:bg-slate-50">
                    + {r.name ? `${r.name} · ` : ''}{r.email}
                  </button>
                ))}
              </div>
            )}
            <label className="block text-xs font-medium text-slate-600">
              CC
              <input aria-label="CC" value={cc} onChange={(e) => setCc(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            {invalid.length > 0 && <p className="text-xs text-red-700">Email không hợp lệ: {invalid.join(', ')}</p>}
            <label className="block text-xs font-medium text-slate-600">
              Tiêu đề
              <input aria-label="Tiêu đề" value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            <label className="block text-xs font-medium text-slate-600">
              Lời nhắn
              <textarea aria-label="Lời nhắn" value={message} onChange={(e) => setMessage(e.target.value)} className="mt-1 h-24 w-full resize-none rounded-md border p-2 text-sm" />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Huỷ</Button>
              <Button className="gap-2" disabled={!canSubmit} onClick={() => sendMutation.mutate()}>
                <Send size={14} /> {sendMutation.isPending ? 'Đang gửi…' : 'Gửi'}
              </Button>
            </div>
          </div>
        )}
        {history.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <p className="mb-2 text-xs font-semibold text-slate-600">Lịch sử gửi</p>
            <ul data-testid="send-history" className="space-y-1.5 text-xs text-slate-700">
              {history.map((h) => (
                <li key={h.id} className="rounded border px-2 py-1.5">
                  <div className="flex justify-between gap-2">
                    <span>Phiên bản {h.versionNumber ?? '—'} → {h.recipients.to.join(', ')}</span>
                    <span className="shrink-0 font-medium">{DELIVERY_LABEL[h.delivery?.status ?? ''] ?? h.delivery?.status ?? '—'}</span>
                  </div>
                  <div className="text-slate-500">{new Date(h.createdAt).toLocaleString('vi-VN')} · {h.attachmentFilename}</div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
