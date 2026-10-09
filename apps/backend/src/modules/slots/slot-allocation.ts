// Logic thuần (không DB) cho cho thuê ngắn hạn: giữ chỗ theo diện tích + thời gian,
// và xác định khoảng thời gian tính tiền. Tách riêng để test độc lập.
import { BadRequestException } from '@nestjs/common';

/**
 * Booking ở các trạng thái này CHIẾM slot thật sự (đã được duyệt hoặc đi xa hơn).
 * PENDING / SUBMITTED KHÔNG chiếm: các booking chưa duyệt bình đẳng với nhau,
 * không áp dụng FIFS -- booking nào được duyệt trước thì thắng.
 */
export const SLOT_HARD_HOLD_STATUSES = ['APPROVED', 'CONFIRMED', 'CONVERTED', 'CONTRACTED'] as const;

/** Booking chưa duyệt, cùng tồn tại với nhau trên một slot. */
export const SLOT_SOFT_HOLD_STATUSES = ['PENDING', 'SUBMITTED'] as const;

const EPS = 1e-6;

export interface OccupancyInterval {
  from: Date;
  to: Date;
  area: number;
}

/**
 * Diện tích lớn nhất bị chiếm ĐỒNG THỜI trong cửa sổ [from, to).
 * Không cộng dồn mọi booking chạm cửa sổ: hai booking nối đuôi nhau (không chồng
 * nhau) chỉ tính là peak của một trong hai.
 */
export function peakOccupiedArea(intervals: OccupancyInterval[], from: Date, to: Date): number {
  const events: Array<{ t: number; delta: number }> = [];
  for (const i of intervals) {
    if (!(i.from < to && i.to > from)) continue;
    events.push({ t: Math.max(i.from.getTime(), from.getTime()), delta: i.area });
    events.push({ t: Math.min(i.to.getTime(), to.getTime()), delta: -i.area });
  }
  // Tại cùng thời điểm xử lý "kết thúc" trước "bắt đầu" để booking nối đuôi không bị tính chồng.
  events.sort((a, b) => a.t - b.t || a.delta - b.delta);
  let current = 0;
  let peak = 0;
  for (const e of events) {
    current += e.delta;
    if (current > peak) peak = current;
  }
  return peak;
}

/** True nếu thêm `requestedArea` vào cửa sổ vẫn nằm trong sức chứa của slot. */
export function fitsCapacity(
  existing: OccupancyInterval[],
  from: Date,
  to: Date,
  requestedArea: number,
  capacity: number,
): boolean {
  return peakOccupiedArea(existing, from, to) + requestedArea <= capacity + EPS;
}

export interface PricingRangeInput {
  basis: 'PROGRAM_ONLY' | 'SETUP_TO_DISMANTLE' | 'CUSTOM_RANGE';
  installationStart: Date;
  start: Date;
  end: Date;
  dismantlingEnd: Date;
  pricingStart?: Date | null;
  pricingEnd?: Date | null;
}

/**
 * Khoảng thời gian dùng để tính tiền thuê, theo cách đã chọn cho giao dịch.
 * Không hard-code một công thức: người dùng chọn khi tạo booking/proposal.
 */
export function resolvePricingRange(input: PricingRangeInput): { from: Date; to: Date } {
  switch (input.basis) {
    case 'SETUP_TO_DISMANTLE':
      return { from: input.installationStart, to: input.dismantlingEnd };
    case 'CUSTOM_RANGE': {
      const { pricingStart: ps, pricingEnd: pe } = input;
      if (!ps || !pe || Number.isNaN(ps.getTime()) || Number.isNaN(pe.getTime())) {
        throw new BadRequestException('Cần nhập khoảng thời gian tính tiền (bắt đầu và kết thúc) khi chọn tùy chỉnh');
      }
      if (pe <= ps) {
        throw new BadRequestException('Thời gian kết thúc tính tiền phải sau thời gian bắt đầu');
      }
      if (ps < input.installationStart || pe > input.dismantlingEnd) {
        throw new BadRequestException('Khoảng tính tiền phải nằm trong khoảng từ lắp đặt đến hết tháo dỡ');
      }
      return { from: ps, to: pe };
    }
    case 'PROGRAM_ONLY':
    default:
      return { from: input.start, to: input.end };
  }
}

/** yyyy-mm-dd theo giờ địa phương, dùng so khớp ngày lễ. */
export function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Tiền thuê theo ngày: mỗi ngày dùng giá cuối tuần/lễ nếu rơi vào T7/CN hoặc ngày lễ,
 * ngược lại giá ngày thường. Số ngày = ceil((to-from)/1 ngày) giống cách tính cũ.
 */
export function dailyAmountWithWeekendHoliday(params: {
  from: Date;
  to: Date;
  area: number;
  weekdayPrice: number;
  weekendHolidayPrice: number;
  holidayKeys: Set<string>;
}): number {
  const days = Math.max(1, Math.ceil((params.to.getTime() - params.from.getTime()) / 86400000));
  let total = 0;
  const cur = new Date(params.from);
  for (let i = 0; i < days; i += 1) {
    const dow = cur.getDay();
    const special = dow === 0 || dow === 6 || params.holidayKeys.has(localDateKey(cur));
    total += (special ? params.weekendHolidayPrice : params.weekdayPrice) * params.area;
    cur.setDate(cur.getDate() + 1);
  }
  return total;
}

/**
 * So thang (lam tron len, toi thieu 1) cua khoang thoi gian thue -- dung cho truong `term` cua
 * Proposal/Hop dong ngan han thay vi hard-code 1. Billing khong dung `term` (no chay theo
 * ngay bat dau/ket thuc), nen gia tri nay chi phan anh dung do dai hop dong.
 */
export function termMonthsForRange(from: Date, to: Date): number {
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  return Math.max(1, Math.ceil(days / 30));
}
