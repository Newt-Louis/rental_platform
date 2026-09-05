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
  // Unit.camPerSqm/askingRentPerSqm/baseRentPerSqm now carry the Unit's own currencyCode
  // (docs/program/MULTI_CURRENCY_ARCHITECTURE.md). Falling back to them across a currency
  // boundary would silently mix scales into the proposal (e.g. a VND 75,000/sqm CAM rate
  // submitted as if it were $75,000/sqm), producing a wildly wrong monthly bill once the
  // contract is billed. So the fallback applies only when the Unit is quoted in the same
  // currency as the proposal -- otherwise leave the field blank for explicit entry. This
  // replaces an older `rentCurrency === 'VND'` check, which both blocked a legitimate
  // USD-unit → USD-proposal prefill and, once Units gained their own currency, would have
  // let a USD-quoted Unit prefill a VND proposal.
  const unitCurrency = (unit as { currencyCode?: string } | undefined)?.currencyCode ?? 'VND';
  const unitCurrencyMatches = unitCurrency === rentCurrency;
  const rawSnapshotCam = (booking?.pricingSnapshot as any)?.camPerSqm;
  const snapshotCam = rawSnapshotCam == null ? undefined : Number(rawSnapshotCam);
  const camPerSqm = booking?.proposedCamPerSqm
    ?? (snapshotCam !== undefined && Number.isFinite(snapshotCam) ? snapshotCam : undefined)
    ?? (unitCurrencyMatches ? unit?.camPerSqm : undefined);

  return {
    area: String(booking?.requestedArea ?? unit?.areaNLA ?? ''),
    term: String(booking?.requestedTerm ?? unit?.minLeaseTerm ?? 36),
    startDate: localIsoDate(),
    rentPerSqm: String(
      booking?.proposedRentPerSqm
      ?? booking?.expectedRent
      ?? (unitCurrencyMatches ? (unit?.askingRentPerSqm ?? unit?.baseRentPerSqm) : undefined)
      ?? '',
    ),
    camPerSqm: String(camPerSqm ?? ''),
    deposit: '3',
    rentFree: '0',
    escalationPercent: String(unit?.escalationRate ?? 5),
    notes: booking?.notes ?? '',
    businessModel: businessModelFromSpaceType(unit?.spaceType),
    rentCurrency,
    exchangeRate: String(booking?.exchangeRate ?? ''),
    // Phí Dịch vụ/Phí HTKD đã đàm phán ở bước Booking (HĐT TTTM) — mang sang làm giá trị mặc định,
    // người dùng vẫn có thể sửa lại trước khi convert.
    serviceFeeSqm: String(booking?.serviceFeeSqm ?? ''),
    businessSupportFeeSqm: String(booking?.businessSupportFeeSqm ?? ''),
    fitoutDays: '90',
    handoverDate: '',
    openingDate: '',
    specialConditions: booking?.notes ?? '',
  };
}
