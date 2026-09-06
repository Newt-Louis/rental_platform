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

/** `null` for anything absent or non-finite; preserves a genuine 0. */
const nullableNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
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
    // ── Numeric fields hold NUMBERS, or `null` when genuinely empty ──────────
    // The conversion form binds these through `NumericField`/`useController`, so
    // form state is authoritative and the submitted payload carries numeric
    // primitives. `null` (not supplied) stays distinguishable from `0` (a real
    // commercial value the user chose), which a string-based `''`/`'0'` model
    // blurred.
    area: nullableNumber(booking?.requestedArea ?? unit?.areaNLA),
    term: booking?.requestedTerm ?? unit?.minLeaseTerm ?? 36,
    startDate: localIsoDate(),
    rentPerSqm: nullableNumber(
      booking?.proposedRentPerSqm
      ?? booking?.expectedRent
      ?? (unitCurrencyMatches ? (unit?.askingRentPerSqm ?? unit?.baseRentPerSqm) : undefined),
    ),
    camPerSqm: nullableNumber(camPerSqm),
    // VISIBLE_BUSINESS_DEFAULT — the shared conversion form renders this
    // pre-filled so the 3-month deposit is a value the user saw and accepted,
    // not a backend `?? 3` they never knew about.
    deposit: 3,
    // SEM-001 — rentFree is denominated in MONTHS. Never days.
    rentFree: 0,
    escalationPercent: nullableNumber(unit?.escalationRate) ?? 5,
    notes: booking?.notes ?? '',
    businessModel: businessModelFromSpaceType(unit?.spaceType),
    rentCurrency,
    exchangeRate: nullableNumber(booking?.exchangeRate),
    // Phí Dịch vụ/Phí HTKD đã đàm phán ở bước Booking (HĐT TTTM) — mang sang làm giá trị mặc định,
    // người dùng vẫn có thể sửa lại trước khi convert.
    serviceFeeSqm: nullableNumber(booking?.serviceFeeSqm),
    businessSupportFeeSqm: nullableNumber(booking?.businessSupportFeeSqm),
    // VISIBLE_BUSINESS_DEFAULT — rendered in section C of the shared form.
    fitoutDays: 90,
    handoverDate: '',
    openingDate: '',
    specialConditions: booking?.notes ?? '',
    // VISIBLE_BUSINESS_DEFAULT — rendered in section B.
    paymentTermDays: 30,
    // OPTIONAL_ZERO_ALLOWED — 0 is a legitimate commercial position (no such
    // fee agreed), so these stay zero-prefilled and always submitted explicitly
    // rather than relying on a backend `?? 0`.
    utilityFee: 0,
    afterHoursFee: 0,
    depositFitout: 0,
    fitoutFee: 0,
    // DERIVED when blank — backend computes depositLease = deposit × monthlyRent.
    depositLease: 0,
    operatingHours: '',
  };
}
