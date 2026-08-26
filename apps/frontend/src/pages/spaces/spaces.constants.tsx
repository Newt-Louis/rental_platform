import React from 'react';
import {
  AlertCircle, BookmarkPlus, Users, FileText, Building2,
  CheckCircle, GitMerge,
} from 'lucide-react';
import { formatVndRate } from './spacesPresentation';

export const STATUS_CONFIG: Record<string, {
  color: string; iconBg: string; leftBorder: string; textColor: string;
}> = {
  VACANT:       { color: 'bg-red-100 text-red-700 border-red-200',          iconBg: 'bg-red-50',    leftBorder: 'border-l-red-400',    textColor: 'text-red-500' },
  BOOKING:      { color: 'bg-amber-100 text-amber-700 border-amber-200',    iconBg: 'bg-amber-50',  leftBorder: 'border-l-amber-400',  textColor: 'text-amber-500' },
  NEGOTIATING:  { color: 'bg-orange-100 text-orange-700 border-orange-200', iconBg: 'bg-orange-50', leftBorder: 'border-l-orange-400', textColor: 'text-orange-500' },
  CONTRACTED:   { color: 'bg-blue-100 text-gray-700 border-gray-200',       iconBg: 'bg-blue-50',   leftBorder: 'border-l-blue-400',   textColor: 'text-blue-500' },
  UNDER_FITOUT: { color: 'bg-purple-100 text-purple-700 border-purple-200', iconBg: 'bg-purple-50', leftBorder: 'border-l-purple-400', textColor: 'text-purple-500' },
  OCCUPIED:     { color: 'bg-green-100 text-green-700 border-green-200',    iconBg: 'bg-green-50',  leftBorder: 'border-l-green-400',  textColor: 'text-green-500' },
  MERGED:       { color: 'bg-gray-100 text-gray-500 border-gray-200',       iconBg: 'bg-gray-50',   leftBorder: 'border-l-gray-300',   textColor: 'text-gray-400' },
};

export const STATUS_ICONS: Record<string, React.ReactNode> = {
  VACANT:       <AlertCircle size={14} />,
  BOOKING:      <BookmarkPlus size={14} />,
  NEGOTIATING:  <Users size={14} />,
  CONTRACTED:   <FileText size={14} />,
  UNDER_FITOUT: <Building2 size={14} />,
  OCCUPIED:     <CheckCircle size={14} />,
  MERGED:       <GitMerge size={14} />,
};

export const SPACE_TYPE_OPTIONS = [
  { value: 'RETAIL_UNIT',    label: 'Sảnh bán lẻ' },
  { value: 'LED',            label: 'Bảng LED' },
  { value: 'ESCALATOR_WRAP', label: 'Thang cuốn' },
  { value: 'KIOSK_EVENT',   label: 'Kiosk / Sự kiện' },
  { value: 'ADVERTISING',   label: 'Quảng cáo' },
  { value: 'SERVICE',       label: 'Dịch vụ' },
];

export const TIER_OPTIONS = [
  { value: 'A', label: 'Tier A — Prime' },
  { value: 'B', label: 'Tier B — Standard' },
  { value: 'C', label: 'Tier C — Value' },
];

export const LEASE_TERM_OPTIONS = [
  { value: 'LONG',  label: 'Dài hạn (3-5 năm)' },
  { value: 'SHORT', label: 'Ngắn hạn' },
];

export const CATEGORIES = [
  'F&B - Ẩm thực',
  'Café & Trà',
  'Thời trang',
  'Giày dép & Túi xách',
  'Phụ kiện & Trang sức',
  'Làm đẹp & Spa',
  'Điện tử & Công nghệ',
  'Giải trí & Vui chơi',
  'Thể thao & Fitness',
  'Siêu thị & FMCG',
  'Cửa hàng tiện lợi',
  'Trang trí nội thất',
  'Giáo dục & Trẻ em',
  'Sức khỏe & Dược phẩm',
  'Dịch vụ tài chính',
  'Du lịch & Dịch vụ',
  'Sách & Văn phòng phẩm',
  'Thú cưng',
  'Khác',
];

export const API_ORIGIN = ((import.meta as any).env?.VITE_API_URL || '/api').replace(/\/api\/?$/, '');

export function mediaUrl(fileUrl?: string | null): string {
  if (!fileUrl) return '';
  if (fileUrl.startsWith('http')) return fileUrl;
  return `${API_ORIGIN}${fileUrl}`;
}

export function fmtDate(d?: string | null): string | null {
  if (!d) return null;
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtMoney(n: number): string {
  return formatVndRate(n);
}
