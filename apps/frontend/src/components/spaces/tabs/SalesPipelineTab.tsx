import React from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, BookmarkPlus, Users, FileText, Clock, X, Plus, CheckCircle, Lock,
} from 'lucide-react';
import { formatMoneyWithCode, type CurrencyCode } from '@/lib/currency';
import { getUnitStatusLabel, humanizeWorkflowValue } from '@/pages/spaces/spacesPresentation';

const BOOKING_STATUS_CONFIG: Record<string, { color: string }> = {
  ACTIVE:    { color: 'bg-amber-100 text-amber-700' },
  PENDING:   { color: 'bg-blue-100 text-gray-700' },
  EXPIRED:   { color: 'bg-gray-100 text-gray-500' },
  CANCELLED: { color: 'bg-red-100 text-red-600' },
  CONVERTED: { color: 'bg-green-100 text-green-700' },
};

const PROP_STATUS_CFG: Record<string, { color: string }> = {
  DRAFT:        { color: 'bg-gray-100 text-gray-600' },
  SUBMITTED:    { color: 'bg-yellow-100 text-yellow-700' },
  UNDER_REVIEW: { color: 'bg-blue-100 text-blue-700' },
  APPROVED:     { color: 'bg-green-100 text-green-700' },
  REJECTED:     { color: 'bg-red-100 text-red-700' },
  CONVERTED:    { color: 'bg-purple-100 text-purple-700' },
};

export function SalesPipelineTab({
  unit, onCreateBooking, onConvertBooking, onCancelBooking,
  onSubmitProposal, onConvertProposal, onNavigateProposals,
  cancelLoading, submitLoading, convertLoading, canManageSales,
}: {
  unit: any;
  onCreateBooking: () => void;
  onConvertBooking: (b: any) => void;
  onCancelBooking: (id: string) => void;
  onSubmitProposal: (id: string) => void;
  onConvertProposal: (id: string) => void;
  onNavigateProposals: () => void;
  cancelLoading: boolean;
  submitLoading: boolean;
  convertLoading: boolean;
  canManageSales: boolean;
}) {
  const { t } = useTranslation(['spaces', 'contracts']);
  const bookings: any[] = unit.bookings ?? [];
  const proposals: any[] = unit.proposals ?? [];

  const activeBookings = bookings.filter((b) => ['ACTIVE','PENDING'].includes(b.status));
  const historyBookings = bookings.filter((b) => !['ACTIVE','PENDING'].includes(b.status));

  // Mặt bằng đã có khách thuê chính thức — không cho tạo booking mới chồng lên (khớp chặn ở backend)
  const isCommitted = ['OCCUPIED', 'CONTRACTED', 'UNDER_FITOUT'].includes(unit.status);

  const fmtMoney = (n: number, currency?: CurrencyCode) => formatMoneyWithCode(n, currency ?? 'VND');
  const fmtDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

  return (
    <div className="space-y-5">

      {/* Cảnh báo khi mặt bằng đã có khách thuê chính thức — không thể tạo booking mới */}
      {isCommitted && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 flex items-start gap-2 text-xs text-gray-500">
          <Lock size={13} className="mt-0.5 shrink-0" />
          <span>{t('spaces:pipeline.committedWarning', { status: getUnitStatusLabel(t, unit.status) })}</span>
        </div>
      )}

      {/* CTA khi trống */}
      {bookings.length === 0 && proposals.length === 0 && !isCommitted && canManageSales && (
        <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-center space-y-2">
          <p className="text-sm text-amber-700 font-medium">Mặt bằng chưa có khách — tạo booking để bắt đầu</p>
          <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white gap-2" onClick={onCreateBooking}>
            <BookmarkPlus size={14} /> Tạo Booking
          </Button>
        </div>
      )}

      {/* Active bookings */}
      {activeBookings.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
              <Users size={11} /> HÀNG ĐỢI BOOKING ({activeBookings.length})
            </span>
            {!isCommitted && canManageSales && (
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1" onClick={onCreateBooking}>
                <Plus size={10} /> Thêm
              </Button>
            )}
          </div>
          <div className="space-y-2">
            {activeBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.PENDING;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? '—';
              const contact = b.lead?.contactName ?? b.customer?.brandName ?? '';
              const dl = b.expiresAt
                ? Math.max(0, Math.ceil((new Date(b.expiresAt).getTime() - Date.now()) / 86400000))
                : null;
              return (
                <div key={b.id} className={`rounded-xl border p-3 ${
                  b.priority === 1 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'
                }`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                        b.priority === 1 ? 'bg-amber-400 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>{b.priority}</span>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">{name}</div>
                        {contact && <div className="text-xs text-gray-400 truncate">{contact}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dl !== null && b.status === 'ACTIVE' && (
                        <span className={`text-xs flex items-center gap-0.5 font-medium ${dl <= 7 ? 'text-red-500' : 'text-gray-400'}`}>
                          <Clock size={10} /> {dl}d
                        </span>
                      )}
                      <Badge className={`text-xs border-0 ${bcfg.color}`}>
                        {t(`spaces:bookingStatus.${b.status}`, { defaultValue: humanizeWorkflowValue(b.status) })}
                      </Badge>
                    </div>
                  </div>

                  {/* Booking details */}
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-gray-500">
                    {b.requestedArea && <span>DT: {b.requestedArea.toLocaleString()} m²</span>}
                    {b.requestedTerm && <span>Hạn: {b.requestedTerm} th</span>}
                    {b.expectedRent && <span>Kỳ vọng: {fmtMoney(b.expectedRent, b.currencyCode)}/m²</span>}
                    {b.proposedRentPerSqm && <span>Đề xuất: {fmtMoney(b.proposedRentPerSqm, b.currencyCode)}/m²</span>}
                    {b.assignedTo && <span className="col-span-2">Sale: {b.assignedTo.fullName}</span>}
                  </div>

                  {/* Linked proposal */}
                  {b.proposal && (
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <FileText size={11} className="text-gray-400" />
                      <span className="font-mono">{b.proposal.proposalNumber}</span>
                      <Badge className={`text-xs border-0 ${PROP_STATUS_CFG[b.proposal.status]?.color}`}>
                        {t(`spaces:proposalStatus.${b.proposal.status}`, { defaultValue: humanizeWorkflowValue(b.proposal.status) })}
                      </Badge>
                      {canManageSales && (
                        <button className="text-gray-400 hover:text-gray-700 ml-auto" onClick={onNavigateProposals}>
                          Xem →
                        </button>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  {canManageSales && <div className="mt-2 flex gap-1.5 flex-wrap">
                    {b.status === 'ACTIVE' && !b.proposal && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-green-700 border-green-200 hover:bg-green-50"
                        onClick={() => onConvertBooking(b)}>
                        <ArrowRight size={10} /> Lập đề xuất
                      </Button>
                    )}
                    {['ACTIVE','PENDING'].includes(b.status) && (
                      <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 text-red-600 border-red-200 hover:bg-red-50"
                        disabled={cancelLoading} onClick={() => onCancelBooking(b.id)}>
                        <X size={10} /> Hủy
                      </Button>
                    )}
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Proposals */}
      {proposals.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold tracking-wider text-gray-400 flex items-center gap-1.5">
              <FileText size={11} /> ĐỀ XUẤT ({proposals.length})
            </span>
            {canManageSales && (
              <button className="text-xs text-gray-500 hover:underline" onClick={onNavigateProposals}>
                Quản lý →
              </button>
            )}
          </div>
          <div className="space-y-3">
            {proposals.map((pr: any) => {
              const ps = PROP_STATUS_CFG[pr.status] ?? PROP_STATUS_CFG.DRAFT;
              const clientName = pr.tenant?.brandName ?? pr.lead?.brandName ?? '—';
              const steps: any[] = pr.approvalWorkflow?.steps ?? [];

              return (
                <div key={pr.id} className={`rounded-xl border p-3 space-y-3 ${
                  pr.status === 'APPROVED' ? 'border-green-200 bg-green-50' :
                  pr.status === 'REJECTED' ? 'border-red-100 bg-red-50/40' :
                  pr.status === 'CONVERTED' ? 'border-purple-100 bg-purple-50/30' :
                  pr.status === 'SUBMITTED' || pr.status === 'UNDER_REVIEW' ? 'border-yellow-200 bg-yellow-50/40' :
                  'border-gray-200 bg-white'
                }`}>
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <span className="text-sm font-mono font-semibold">{pr.proposalNumber}</span>
                      <span className="text-xs text-gray-500 ml-2">{clientName}</span>
                    </div>
                    <Badge className={`text-xs border-0 flex-shrink-0 ${ps.color}`}>
                      {t(`spaces:proposalStatus.${pr.status}`, { defaultValue: humanizeWorkflowValue(pr.status) })}
                    </Badge>
                  </div>

                  {/* Financial summary */}
                  {(() => {
                    const totalMonthly = (pr.monthlyRent ?? 0)
                      + (pr.monthlyCAM ?? 0)
                      + ((pr.area ?? 0) * (pr.serviceFeeSqm ?? 0))
                      + ((pr.area ?? 0) * (pr.businessSupportFeeSqm ?? 0));
                    return (
                      <div className="space-y-1 text-xs">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                          <div>
                            <span className="text-gray-400">Diện tích: </span>
                            <span className="font-medium">{pr.area?.toLocaleString()} m²</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Thời hạn: </span>
                            <span className="font-medium">{pr.term} tháng</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Giá thuê/m²: </span>
                            <span className="font-medium">{fmtMoney(pr.rentPerSqm, pr.rentCurrency)}</span>
                          </div>
                          <div>
                            <span className="text-gray-400">Tiền thuê/tháng: </span>
                            <span className="font-medium">{fmtMoney(pr.monthlyRent, pr.rentCurrency)}</span>
                          </div>
                          {(pr.monthlyCAM ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí DVPT/tháng: </span>
                              <span className="font-medium">{fmtMoney(pr.monthlyCAM, pr.rentCurrency)}</span>
                            </div>
                          )}
                          {(pr.serviceFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí DV/tháng: </span>
                              <span className="font-medium">{fmtMoney((pr.area ?? 0) * pr.serviceFeeSqm, pr.rentCurrency)}</span>
                            </div>
                          )}
                          {(pr.businessSupportFeeSqm ?? 0) > 0 && (
                            <div>
                              <span className="text-gray-400">Phí HT KD/tháng: </span>
                              <span className="font-medium">{fmtMoney((pr.area ?? 0) * pr.businessSupportFeeSqm, pr.rentCurrency)}</span>
                            </div>
                          )}
                          {pr.discount > 0 && (
                            <div>
                              <span className="text-gray-400">Chiết khấu: </span>
                              <span className="text-red-600 font-medium">{pr.discount}%</span>
                            </div>
                          )}
                          {pr.rentFree > 0 && (
                            <div>
                              <span className="text-gray-400">Rent-free: </span>
                              <span className="font-medium">{pr.rentFree} tháng</span>
                            </div>
                          )}
                        </div>
                        {/* Total monthly highlight */}
                        <div className="flex items-center justify-between bg-gray-50 rounded px-2 py-1 mt-1">
                          <span className="text-gray-500">Tổng phải trả/tháng:</span>
                          <span className="font-bold text-gray-900">{fmtMoney(totalMonthly, pr.rentCurrency)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-400">Tổng giá trị HĐ:</span>
                          <span className="font-bold text-green-700">{fmtMoney(pr.totalContractValue, pr.rentCurrency)}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 text-gray-400">
                          <span>Bắt đầu: {fmtDate(pr.startDate)}</span>
                          <span>Kết thúc: {fmtDate(pr.endDate)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Approval steps */}
                  {steps.length > 0 && (
                    <div className="border-t border-dashed border-gray-200 pt-2">
                      <div className="text-xs text-gray-400 mb-1.5 font-medium">QUY TRÌNH PHÊ DUYỆT</div>
                      <div className="space-y-1">
                        {steps.map((s: any) => (
                          <div key={s.id} className="flex items-center gap-2 text-xs">
                            {s.status === 'APPROVED' ? (
                              <CheckCircle size={12} className="text-green-500 flex-shrink-0" />
                            ) : s.status === 'REJECTED' ? (
                              <X size={12} className="text-red-500 flex-shrink-0" />
                            ) : (
                              <div className="w-3 h-3 rounded-full border-2 border-gray-300 flex-shrink-0" />
                            )}
                            <span className={`flex-1 ${s.status === 'PENDING' ? 'text-gray-500' : 'text-gray-700'}`}>
                              Bước {s.stepOrder}: {s.approver?.fullName ?? s.approverRole}
                            </span>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              s.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                              s.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                              'bg-gray-100 text-gray-500'
                            }`}>
                              {t(`spaces:approvalStatus.${s.status}`, { defaultValue: humanizeWorkflowValue(s.status) })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Contract link */}
                  {pr.contract && (
                    <div className="flex items-center gap-2 text-xs bg-purple-50 border border-purple-100 rounded-lg p-2">
                      <FileText size={12} className="text-purple-500" />
                      <span className="font-mono font-medium">{pr.contract.contractNumber}</span>
                      <Badge className="text-xs border-0 bg-purple-100 text-purple-700 ml-auto">
                        {t(`contracts:status.${pr.contract.status}`, { defaultValue: humanizeWorkflowValue(pr.contract.status) })}
                      </Badge>
                    </div>
                  )}

                  {/* Quick actions */}
                  {canManageSales && <div className="flex gap-1.5 flex-wrap">
                    {pr.status === 'DRAFT' && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-gray-900 hover:bg-gray-800 text-white"
                        disabled={submitLoading} onClick={() => onSubmitProposal(pr.id)}>
                        <ArrowRight size={11} /> Gửi phê duyệt
                      </Button>
                    )}
                    {pr.status === 'APPROVED' && !pr.contract && (
                      <Button size="sm" className="h-7 text-xs px-2 gap-1 bg-green-600 hover:bg-green-700 text-white"
                        disabled={convertLoading} onClick={() => onConvertProposal(pr.id)}>
                        <CheckCircle size={11} /> Ký Hợp đồng
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 text-gray-500"
                      onClick={onNavigateProposals}>
                      Chi tiết →
                    </Button>
                  </div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Booking history */}
      {historyBookings.length > 0 && (
        <div>
          <div className="text-xs font-semibold tracking-wider text-gray-400 mb-2">LỊCH SỬ BOOKING</div>
          <div className="space-y-1">
            {historyBookings.map((b: any) => {
              const bcfg = BOOKING_STATUS_CONFIG[b.status] ?? BOOKING_STATUS_CONFIG.EXPIRED;
              const name = b.lead?.brandName ?? b.customer?.companyName ?? '—';
              return (
                <div key={b.id} className="flex items-center justify-between py-1.5 px-2 text-xs text-gray-500 border border-gray-100 rounded-lg bg-gray-50">
                  <span className="font-medium text-gray-700">{name}</span>
                  <Badge className={`text-xs border-0 ${bcfg.color}`}>
                    {t(`spaces:bookingStatus.${b.status}`, { defaultValue: humanizeWorkflowValue(b.status) })}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
