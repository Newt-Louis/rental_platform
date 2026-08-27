import { BookingWorkspaceDialog } from "@/components/bookings/BookingWorkspaceDialog";

export function CreateBookingDialog({
  open,
  onClose,
  mallId,
  mallName,
}: {
  open: boolean;
  onClose: () => void;
  mallId?: string | null;
  mallName?: string;
}) {
  return (
    <BookingWorkspaceDialog
      open={open}
      onClose={onClose}
      mallId={mallId}
      mallName={mallName}
    />
  );
}
