import type { UnitBooking } from '@/types';

const localIsoDate = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const businessModelFromSpaceType = (spaceType?: string) => {
  if (spaceType === 'RETAIL_UNIT' || spaceType === 'SERVICE') return 'SHOP';
  if (spaceType === 'KIOSK_EVENT') return 'KIOSK';
  if (spaceType === 'ADVERTISING' || spaceType === 'LED' || spaceType === 'ESCALATOR_WRAP') return 'EVENT';
  return '';
};

export function buildProposalPrefill(booking: UnitBooking | null) {
  const unit = booking?.unit;
  const rawSnapshotCam = (booking?.pricingSnapshot as any)?.camPerSqm;
  const snapshotCam = rawSnapshotCam == null ? undefined : Number(rawSnapshotCam);
  const camPerSqm = booking?.proposedCamPerSqm
    ?? (snapshotCam !== undefined && Number.isFinite(snapshotCam) ? snapshotCam : undefined)
    ?? unit?.camPerSqm;

  return {
    area: String(booking?.requestedArea ?? unit?.areaNLA ?? ''),
    term: String(booking?.requestedTerm ?? unit?.minLeaseTerm ?? 36),
    startDate: localIsoDate(),
    rentPerSqm: String(
      booking?.proposedRentPerSqm
      ?? booking?.expectedRent
      ?? unit?.askingRentPerSqm
      ?? unit?.baseRentPerSqm
      ?? '',
    ),
    camPerSqm: String(camPerSqm ?? ''),
    deposit: '3',
    rentFree: '0',
    escalationPercent: String(unit?.escalationRate ?? 5),
    notes: booking?.notes ?? '',
    businessModel: businessModelFromSpaceType(unit?.spaceType),
    rentCurrency: 'VND',
    serviceFeeSqm: '',
    businessSupportFeeSqm: '',
    fitoutDays: '90',
    handoverDate: '',
    openingDate: '',
    specialConditions: booking?.notes ?? '',
  };
}
