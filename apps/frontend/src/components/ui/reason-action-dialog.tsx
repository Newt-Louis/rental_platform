import { useEffect, useState } from 'react';
import { Button } from './button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog';
import { Textarea } from './textarea';

interface ReasonActionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  loading?: boolean;
  minLength?: number;
  onConfirm: (reason: string) => void;
}

export function ReasonActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Xác nhận',
  loading = false,
  minLength = 1,
  onConfirm,
}: ReasonActionDialogProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!open) setReason('');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <label htmlFor="action-reason" className="text-sm font-medium">Lý do</label>
        <Textarea
          id="action-reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Nhập lý do để lưu vào lịch sử xử lý..."
          autoFocus
        />
        {reason.trim().length > 0 && reason.trim().length < minLength && (
          <p className="text-xs text-red-500">Lý do cần ít nhất {minLength} ký tự.</p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Quay lại</Button>
          <Button variant="destructive" disabled={reason.trim().length < minLength || loading} onClick={() => onConfirm(reason.trim())}>
            {loading ? 'Đang xử lý…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
