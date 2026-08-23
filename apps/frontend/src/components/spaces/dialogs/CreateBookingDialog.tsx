import { BookingWorkspaceDialog } from "@/components/bookings/BookingWorkspaceDialog";
import type { Unit } from "@/types";

export function CreateBookingDialog({
  unitId,
  unit,
  open,
  onClose,
}: {
  unitId: string;
  unitCode: string;
  unit?: Unit;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BookingWorkspaceDialog
      open={open}
      onClose={onClose}
      mallId={unit?.mallId}
      mallName={unit?.mall?.name}
      initialUnitId={unitId}
      initialUnitMallId={unit?.mallId}
    />
  );
}
