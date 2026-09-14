import { useNavigate } from 'react-router-dom';
import { ProposalConversionForm } from '@/components/proposals/ProposalConversionForm';
import type { UnitBooking } from '@/types';

/**
 * Bookings entry point for Booking → Proposal.
 *
 * Shares its entire field model with the Spaces entry point
 * (`components/spaces/dialogs/ConvertBookingDialog`) via
 * `components/proposals/ProposalConversionForm`. The only difference retained
 * here is the post-success navigation into the newly created proposal.
 *
 * This file previously carried its own field list, which was missing the whole
 * "Tiến độ & Bàn giao" section — so a proposal created from this screen always
 * had a null handoverDate and a silently defaulted 90-day fitout period.
 * Do not reintroduce fields here; add them to the shared form.
 */
export function ConvertToProposalDialog({ booking, open, onClose }: {
  booking: UnitBooking | null; open: boolean; onClose: () => void;
}) {
  const navigate = useNavigate();

  return (
    <ProposalConversionForm
      booking={booking as any}
      open={open}
      onClose={onClose}
      onSuccess={(data: any) =>
        navigate(data?.proposal?.id ? `/proposals?id=${data.proposal.id}` : '/proposals')
      }
    />
  );
}
