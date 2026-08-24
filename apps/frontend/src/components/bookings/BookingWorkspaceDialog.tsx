import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookmarkPlus, Building2, User, X } from "lucide-react";
import { bookingApi, spacesApi, usersApi } from "@/api";
import type { BookingUnitFinderRow } from "@/api/bookings";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { CURRENCIES, CURRENCY_CODES, type CurrencyCode } from "@/lib/currency";
import { PartyFinder, type BookingLead } from "./PartyFinder";
import { UnitFinder } from "./UnitFinder";

interface BookingWorkspaceDialogProps {
  open: boolean;
  onClose: () => void;
  mallId?: string | null;
  mallName?: string;
  initialUnitId?: string;
  initialUnitMallId?: string;
}

const EMPTY_DETAILS = {
  requestedArea: "",
  requestedTerm: "",
  expectedRent: "",
  proposedRentPerSqm: "",
  proposedCamPerSqm: "",
  holdDays: "30",
  notes: "",
  assignedToId: "",
  currencyCode: "VND" as CurrencyCode,
};

export function BookingWorkspaceDialog({
  open,
  onClose,
  mallId,
  mallName,
  initialUnitId,
  initialUnitMallId,
}: BookingWorkspaceDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [workspaceMallId, setWorkspaceMallId] = useState<string | undefined>(
    mallId ?? initialUnitMallId,
  );
  const [selectedUnit, setSelectedUnit] = useState<BookingUnitFinderRow | null>(
    null,
  );
  const [selectedLead, setSelectedLead] = useState<BookingLead | null>(null);
  const [details, setDetails] = useState(EMPTY_DETAILS);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setWorkspaceMallId(mallId ?? initialUnitMallId);
    setSelectedUnit(null);
    setSelectedLead(null);
    setDetails(EMPTY_DETAILS);
    setSubmitError(null);
  }, [initialUnitId, initialUnitMallId, mallId, open]);

  const mallsData = useQuery({
    queryKey: ["booking-workspace-malls"],
    queryFn: () => spacesApi.listMalls(),
    enabled: open && !mallId && !initialUnitMallId,
    staleTime: 60_000,
  }).data;
  const malls: any[] = Array.isArray(mallsData)
    ? mallsData
    : (mallsData?.data ?? []);

  const usersData = useQuery({
    queryKey: ["users-list"],
    queryFn: () => usersApi.listUsers({ limit: 100 }),
    enabled: open,
    staleTime: 60_000,
  }).data;
  const users: any[] = Array.isArray(usersData)
    ? usersData
    : (usersData?.data ?? []);

  const selectUnit = useCallback((unit: BookingUnitFinderRow) => {
    setSelectedUnit(unit);
    setSubmitError(null);
  }, []);

  const selectLead = (lead: BookingLead) => {
    setSelectedLead(lead);
    setDetails((current) => ({
      ...current,
      requestedArea:
        lead.expectedArea != null ? String(lead.expectedArea) : "",
      notes: lead.notes ?? "",
      assignedToId: lead.assignedToId ?? lead.assignedTo?.id ?? "",
    }));
    setSubmitError(null);
  };

  const mutation = useMutation({
    mutationFn: () =>
      bookingApi.create({
        unitId: selectedUnit!.id,
        leadId: selectedLead!.id,
        requestedArea: details.requestedArea
          ? Number(details.requestedArea)
          : undefined,
        requestedTerm: details.requestedTerm
          ? Number(details.requestedTerm)
          : undefined,
        expectedRent: details.expectedRent
          ? Number(details.expectedRent)
          : undefined,
        proposedRentPerSqm: details.proposedRentPerSqm
          ? Number(details.proposedRentPerSqm)
          : undefined,
        proposedCamPerSqm: details.proposedCamPerSqm
          ? Number(details.proposedCamPerSqm)
          : undefined,
        currencyCode: details.currencyCode,
        holdDays: Number(details.holdDays) || 30,
        notes: details.notes || undefined,
        assignedToId: details.assignedToId || undefined,
      }),
    onSuccess: (booking: any) => {
      queryClient.invalidateQueries({ queryKey: ["bookings"] });
      queryClient.invalidateQueries({ queryKey: ["booking-stats"] });
      queryClient.invalidateQueries({ queryKey: ["booking-unit-finder"] });
      queryClient.invalidateQueries({ queryKey: ["unit-detail"] });
      queryClient.invalidateQueries({ queryKey: ["units"] });
      queryClient.invalidateQueries({ queryKey: ["occupancy"] });
      toast({
        title: "Đã tạo Booking",
        description: booking?.status
          ? `${booking.bookingNumber ?? ""} · ${booking.status}${booking.priority ? ` · Ưu tiên ${booking.priority}` : ""}`
          : undefined,
      });
      onClose();
    },
    onError: (error: any) => {
      const message =
        error?.response?.data?.message ??
        "Không thể tạo Booking. Vui lòng thử lại.";
      setSubmitError(Array.isArray(message) ? message.join(", ") : message);
      toast({
        title: Array.isArray(message) ? message.join(", ") : message,
        variant: "destructive",
      });
    },
  });

  const setDetail =
    (key: keyof typeof details) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >,
    ) =>
      setDetails((current) => ({ ...current, [key]: event.target.value }));

  const selectableUnit = !!selectedUnit?.currentEligibility.selectable;
  const canSubmit =
    !!workspaceMallId &&
    selectableUnit &&
    !!selectedLead &&
    !mutation.isPending;
  const currencySymbol =
    CURRENCIES[details.currencyCode]?.symbol ?? details.currencyCode;

  const changeMall = (nextMallId: string) => {
    setWorkspaceMallId(nextMallId);
    setSelectedUnit(null);
    setSelectedLead(null);
    setSubmitError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="!flex h-[calc(100dvh-1rem)] max-w-[min(96vw,1180px)] !max-h-none flex-col gap-0 overflow-hidden p-0 sm:h-[90dvh]">
        <DialogHeader className="shrink-0 border-b px-4 py-4 pr-12 sm:px-6 sm:py-5">
          <DialogTitle className="flex items-center gap-2">
            <BookmarkPlus
              className="h-5 w-5 text-amber-600"
              aria-hidden="true"
            />
            Tạo Booking / Giữ Lô
          </DialogTitle>
          <DialogDescription>
            Chọn Lead và Unit dài hạn. Unit đang BOOKING vẫn có thể nhận Booking
            xếp hàng khi máy chủ xác nhận đủ điều kiện.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="mb-4 rounded-lg border bg-gray-50 p-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                  Mall context
                </p>
                <p className="text-sm text-gray-700">
                  Lead và Unit phải thuộc cùng Mall.
                </p>
              </div>
              {mallId || initialUnitMallId ? (
                <Badge variant="blue">
                  {selectedUnit?.mall.name ??
                    mallName ??
                    malls.find((mall) => mall.id === workspaceMallId)?.name ??
                    "Mall đã chọn"}
                </Badge>
              ) : (
                <Select value={workspaceMallId} onValueChange={changeMall}>
                  <SelectTrigger
                    className="w-full sm:w-72"
                    aria-label="Chọn Mall cho Booking"
                  >
                    <SelectValue placeholder="Chọn Mall..." />
                  </SelectTrigger>
                  <SelectContent>
                    {malls.map((mall) => (
                      <SelectItem key={mall.id} value={mall.id}>
                        {mall.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
            <div className="min-w-0 rounded-xl border bg-white p-4">
              <UnitFinder
                mallId={workspaceMallId}
                initialUnitId={initialUnitId}
                selectedUnit={selectedUnit}
                onSelect={selectUnit}
              />
            </div>

            <div className="min-w-0 space-y-5">
              <div className="rounded-xl border bg-white p-4">
                <PartyFinder
                  mallId={workspaceMallId}
                  selectedLead={selectedLead}
                  onSelect={selectLead}
                />
              </div>

              <div
                className="space-y-3 rounded-xl border bg-white p-4"
                aria-live="polite"
              >
                <h3 className="font-semibold text-gray-900">
                  Thông tin đã chọn
                </h3>
                {selectedUnit ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                    <div className="flex items-start gap-2">
                      <Building2
                        className="mt-0.5 h-4 w-4 text-amber-600"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">
                            {selectedUnit.code}
                            {selectedUnit.name ? ` — ${selectedUnit.name}` : ""}
                          </span>
                          <Badge
                            variant={
                              selectedUnit.currentEligibility.mode === "QUEUE"
                                ? "warning"
                                : selectedUnit.currentEligibility.selectable
                                  ? "success"
                                  : "destructive"
                            }
                          >
                            {selectedUnit.currentEligibility.mode}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600">
                          {selectedUnit.mall.name} ·{" "}
                          {selectedUnit.floor?.name ?? "Chưa có tầng"} ·{" "}
                          {selectedUnit.zone?.name ?? "Chưa có khu"}
                        </p>
                        <p className="text-xs text-gray-600">
                          NLA:{" "}
                          {selectedUnit.areaNLA?.toLocaleString("vi-VN") ?? "—"}{" "}
                          m² · GFA:{" "}
                          {selectedUnit.areaGFA?.toLocaleString("vi-VN") ?? "—"}{" "}
                          m² · {selectedUnit.status}
                        </p>
                        {selectedUnit.currentEligibility.mode === "QUEUE" && (
                          <p className="mt-1 text-xs font-medium text-amber-800">
                            Booking mới sẽ vào hàng chờ. Kết quả cuối cùng được
                            xác nhận khi tạo.
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Bỏ chọn Unit"
                        onClick={() => setSelectedUnit(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Chưa chọn Unit.</p>
                )}

                {selectedLead ? (
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-start gap-2">
                      <User
                        className="mt-0.5 h-4 w-4 text-blue-600"
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">
                          {selectedLead.brandName ||
                            selectedLead.company ||
                            "Lead chưa đặt tên"}
                        </p>
                        <p className="text-xs text-gray-600">
                          {selectedLead.contactName || "Chưa có người liên hệ"}
                          {selectedLead.phone ? ` · ${selectedLead.phone}` : ""}
                        </p>
                        {selectedLead.customer && (
                          <p className="text-xs text-gray-600">
                            Customer:{" "}
                            {selectedLead.customer.customerCode ||
                              selectedLead.customer.companyName}
                          </p>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        aria-label="Bỏ chọn Lead"
                        onClick={() => setSelectedLead(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">Chưa chọn Lead.</p>
                )}
              </div>

              <div className="space-y-3 rounded-xl border bg-white p-4">
                <h3 className="font-semibold text-gray-900">
                  Chi tiết Booking
                </h3>
                <p className="text-xs text-gray-500">
                  Dữ liệu có sẵn từ Lead đã được điền tự động. Chỉ điều chỉnh
                  khi thông tin của Booking này khác với nhu cầu đã ghi nhận.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Diện tích yêu cầu (m²)">
                    <Input
                      aria-label="Diện tích yêu cầu"
                      type="number"
                      min={0}
                      value={details.requestedArea}
                      onChange={setDetail("requestedArea")}
                    />
                  </Field>
                  <Field label="Thời hạn (tháng)">
                    <Input
                      aria-label="Thời hạn thuê"
                      type="number"
                      min={1}
                      value={details.requestedTerm}
                      onChange={setDetail("requestedTerm")}
                    />
                  </Field>
                  <Field label="Giữ (ngày)">
                    <Input
                      aria-label="Số ngày giữ"
                      type="number"
                      min={1}
                      value={details.holdDays}
                      onChange={setDetail("holdDays")}
                    />
                  </Field>
                </div>
                <Field label="Đơn vị tiền tệ">
                  <Select
                    value={details.currencyCode}
                    onValueChange={(value) =>
                      setDetails((current) => ({
                        ...current,
                        currencyCode: value as CurrencyCode,
                      }))
                    }
                  >
                    <SelectTrigger aria-label="Đơn vị tiền tệ">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCY_CODES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label={`Giá kỳ vọng (${currencySymbol}/m²)`}>
                    <Input
                      aria-label="Giá kỳ vọng"
                      type="number"
                      min={0}
                      value={details.expectedRent}
                      onChange={setDetail("expectedRent")}
                    />
                  </Field>
                  <Field label={`Giá đề xuất (${currencySymbol}/m²)`}>
                    <Input
                      aria-label="Giá đề xuất"
                      type="number"
                      min={0}
                      value={details.proposedRentPerSqm}
                      onChange={setDetail("proposedRentPerSqm")}
                    />
                  </Field>
                  <Field label={`CAM đề xuất (${currencySymbol}/m²)`}>
                    <Input
                      aria-label="CAM đề xuất"
                      type="number"
                      min={0}
                      value={details.proposedCamPerSqm}
                      onChange={setDetail("proposedCamPerSqm")}
                    />
                  </Field>
                </div>
                <Field label="Phụ trách (Sale)">
                  <select
                    className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm"
                    value={details.assignedToId}
                    onChange={setDetail("assignedToId")}
                  >
                    <option value="">-- Chưa phân công --</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.fullName}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Ghi chú">
                  <Textarea
                    aria-label="Ghi chú Booking"
                    rows={2}
                    value={details.notes}
                    onChange={setDetail("notes")}
                  />
                </Field>
              </div>

              {submitError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                >
                  {submitError} Dữ liệu đã nhập vẫn được giữ để bạn kiểm tra và
                  thử lại.
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t bg-white px-4 py-3 sm:px-6 sm:py-4">
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="max-w-full gap-2 whitespace-normal bg-amber-600 text-center text-white hover:bg-amber-700"
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending
              ? "Đang tạo..."
              : selectedUnit?.currentEligibility.mode === "QUEUE"
                ? "Tạo Booking vào hàng chờ"
                : "Tạo Booking"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
