import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { bookingApi } from '@/api';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

export function ExtendDialog({ bookingId, open, onClose }: {
  bookingId: string; open: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [days, setDays] = useState('15');
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => bookingApi.extend(bookingId, Number(days), reason || undefined),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      toast({ title: `Đã gia hạn thêm ${days} ngày` });
      onClose();
    },
    onError: () => toast({ title: 'Lỗi gia hạn', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Gia hạn booking</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-sm font-medium mb-1 block">Số ngày gia hạn thêm</label>
            <Input value={days} onChange={(e) => setDays(e.target.value)} type="number" min={1} />
          </div>
          <div>
            <label className="text-sm font-medium mb-1 block">Lý do (tuỳ chọn)</label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Khách chờ phê duyệt nội bộ..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Hủy</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang gia hạn...' : 'Gia hạn'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
