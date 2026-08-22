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
  const rentCurrency = booking?.currencyCode ?? 'VND';
  // Unit.camPerSqm/askingRentPerSqm/baseRentPerSqm have no currency field of their own -- they
  // are always VND (docs/program/MULTI_CURRENCY_ARCHITECTURE.md). Falling back to them for a
  // non-VND booking would silently mix a VND-scale number into a USD/MMK proposal (e.g. a VND
  // 75,000/sqm CAM rate submitted as if it were $75,000/sqm), producing a wildly wrong monthly
  // bill once the contract is billed. Only use the Unit fallback when the proposal is actually
  // VND; otherwise leave the field blank so the user must enter it explicitly in the right unit.
  const isVndPricing = rentCurrency === 'VND';
  const rawSnapshotCam = (booking?.pricingSnapshot as any)?.camPerSqm;
  const snapshotCam = rawSnapshotCam == null ? undefined : Number(rawSnapshotCam);
  const camPerSqm = booking?.proposedCamPerSqm
    ?? (snapshotCam !== undefined && Number.isFinite(snapshotCam) ? snapshotCam : undefined)
    ?? (isVndPricing ? unit?.camPerSqm : undefined);

  return {
    area: String(booking?.requestedArea ?? unit?.areaNLA ?? ''),
    term: String(booking?.requestedTerm ?? unit?.minLeaseTerm ?? 36),
    startDate: localIsoDate(),
    rentPerSqm: String(
      booking?.proposedRentPerSqm
      ?? booking?.expectedRent
      ?? (isVndPricing ? (unit?.askingRentPerSqm ?? unit?.baseRentPerSqm) : undefined)
      ?? '',
    ),
    camPerSqm: String(camPerSqm ?? ''),
    deposit: '3',
    rentFree: '0',
    escalationPercent: String(unit?.escalationRate ?? 5),
    notes: booking?.notes ?? '',
    businessModel: businessModelFromSpaceType(unit?.spaceType),
    rentCurrency,
    serviceFeeSqm: '',
    businessSupportFeeSqm: '',
    fitoutDays: '90',
    handoverDate: '',
    openingDate: '',
    specialConditions: booking?.notes ?? '',
  };
}
