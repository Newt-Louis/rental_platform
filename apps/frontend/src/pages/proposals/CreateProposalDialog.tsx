import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { bookingApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Search, Building2, ArrowRight, ClipboardList, Loader2 } from 'lucide-react';
import type { UnitBooking } from '@/types';

/**
 * Entry point for "Tạo đề xuất" (Create Proposal) from the Proposals list.
 * Proposals can only be created by converting an active Booking (server-side
 * requirement), so this picker surfaces eligible bookings instead of forcing
 * the user to already know that and navigate to /bookings themselves.
 * See docs/audit/04-UX-FRICTION-REPORT.md FR-02.
 */
export function CreateProposalEntryDialog({
  open, onClose, onPickBooking, mallId,
}: {
  open: boolean;
  onClose: () => void;
  onPickBooking: (booking: UnitBooking) => void;
  mallId?: string;
}) {
  const { t } = useTranslation('deals');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['proposal-entry-bookings', mallId],
    queryFn: () => bookingApi.list({ status: 'ACTIVE', mallId: mallId || undefined, limit: 100 }),
    enabled: open,
  });
  const bookings: UnitBooking[] = (data?.data ?? data ?? []).filter((b: UnitBooking) => !b.proposal);

  const filtered = bookings.filter((b) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      b.bookingNumber?.toLowerCase().includes(q) ||
      b.unit?.code?.toLowerCase().includes(q) ||
      b.lead?.brandName?.toLowerCase().includes(q) ||
      b.customer?.companyName?.toLowerCase().includes(q)
    );
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList size={18} className="text-blue-600" />
            {t('proposals.createEntry.title')}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t('proposals.createEntry.subtitle')}</p>
        </DialogHeader>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            className="pl-8"
            placeholder={t('proposals.createEntry.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {isLoading && (
            <div className="py-8 text-center text-sm text-gray-400 flex items-center justify-center gap-2">
              <Loader2 size={14} className="animate-spin" /> {t('proposals.createEntry.loading')}
            </div>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-gray-400 space-y-3">
              <Building2 size={32} className="mx-auto opacity-20" />
              <p>{search ? t('proposals.createEntry.noMatch') : t('proposals.createEntry.empty')}</p>
              {!search && (
                <Button size="sm" variant="outline" onClick={() => { onClose(); navigate('/bookings'); }}>
                  {t('proposals.createEntry.goToBookings')}
                </Button>
              )}
            </div>
          )}
          {filtered.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onPickBooking(b)}
              className="w-full flex items-center justify-between rounded-lg border p-3 text-left hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
            >
              <div>
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {b.unit?.code ?? '—'} · {b.lead?.brandName ?? b.customer?.companyName ?? t('proposals.createEntry.noParty')}
                </div>
                <div className="text-xs text-gray-500">{b.bookingNumber}</div>
              </div>
              <ArrowRight size={16} className="text-gray-400 shrink-0" />
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
