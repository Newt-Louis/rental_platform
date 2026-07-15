export const CATEGORY_OPTS: Record<string, string> = {
  FB: '🍜 F&B',
  FASHION: '👗 Thời trang',
  ENTERTAINMENT: '🎮 Giải trí',
  SERVICES: '⚙️ Dịch vụ',
  EDUCATION: '📚 Giáo dục',
  HEALTH: '🏥 Sức khoẻ',
  RETAIL: '🛍️ Bán lẻ',
};

export const LEAD_SOURCE_OPTS = [
  { value: 'BROKER', label: 'Môi giới' },
  { value: 'WEBSITE', label: 'Website' },
  { value: 'REFERRAL', label: 'Giới thiệu' },
  { value: 'WALK_IN', label: 'Trực tiếp' },
  { value: 'EXISTING_TENANT', label: 'KH hiện tại' },
];

export const LEAD_PRIORITY_OPTS = [
  { value: 'HOT', label: '🔥 Hot' },
  { value: 'WARM', label: '🌤 Warm' },
  { value: 'COLD', label: '🧊 Cold' },
];

const RE_PHONE = /^(0|\+84)[0-9]{8,10}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(p: string | null | undefined) {
  return (p ?? '').replace(/[\s\-().]/g, '');
}

export function validateLeadForm(f: { brandName: string; contactName: string; phone: string; email: string }) {
  const errors: Partial<Record<'brandName' | 'contactName' | 'phone' | 'email', string>> = {};
  if (!f.brandName.trim()) errors.brandName = 'Tên thương hiệu không được để trống';
  else if (f.brandName.trim().length < 2) errors.brandName = 'Tên thương hiệu quá ngắn (tối thiểu 2 ký tự)';
  if (!f.contactName.trim()) errors.contactName = 'Người liên hệ không được để trống';
  if (f.phone && !RE_PHONE.test(f.phone.trim())) errors.phone = 'Số điện thoại không hợp lệ (VD: 0912345678)';
  if (f.email && !RE_EMAIL.test(f.email.trim())) errors.email = 'Email không đúng định dạng';
  return errors;
}
