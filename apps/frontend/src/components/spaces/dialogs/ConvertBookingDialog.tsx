import { ProposalConversionForm } from '@/components/proposals/ProposalConversionForm';

/**
 * Spaces entry point for Booking → Proposal.
 *
 * The form itself lives in `components/proposals/ProposalConversionForm` and is
 * shared with the Bookings entry point (`pages/bookings/ConvertToProposalDialog`).
 * This file previously carried its own field list, which had drifted out of
 * parity with the Bookings dialog — the two submitted almost disjoint subsets of
 * the same DTO. Do not reintroduce fields here; add them to the shared form.
 */
export function ConvertBookingDialog({
  booking, onClose,
}: {
  booking: any | null;
  onClose: () => void;
}) {
  return (
    <ProposalConversionForm
      booking={booking}
      open={!!booking}
      onClose={onClose}
    />
  );
}
