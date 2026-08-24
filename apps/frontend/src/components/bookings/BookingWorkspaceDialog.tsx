import { useCallback, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { BookmarkPlus, X } from "lucide-react";
import { bookingApi, spacesApi, usersApi } from "@/api";
import type { BookingUnitFinderRow } from "@/api/bookings";
import { ERPStatusBadge } from "@/components/erp";
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
  const { t } = useTranslation("bookings");
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
      requestedArea: lead.expectedArea != null ? String(lead.expectedArea) : "",
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
      <DialogContent className="!flex h-[calc(100dvh-0.75rem)] max-w-[min(98vw,1280px)] !max-h-none flex-col gap-0 overflow-hidden rounded-lg border-border bg-background p-0 shadow-xl sm:h-[92dvh]">
        <DialogHeader className="shrink-0 border-b border-border bg-card px-4 py-3 pr-12 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary">
                {t("workspace.longTerm")}
              </p>
              <DialogTitle className="text-lg font-semibold leading-tight text-foreground">
                {t("workspace.title")}
              </DialogTitle>
              <DialogDescription className="mt-1 max-w-2xl text-xs leading-relaxed">
                {t("workspace.description")}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 flex-col gap-1.5 sm:items-end">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("workspace.mall")}
              </span>
              {mallId || initialUnitMallId ? (
                <ERPStatusBadge tone="brand" className="justify-center">
                  {selectedUnit?.mall.name ??
                    mallName ??
                    malls.find((mall) => mall.id === workspaceMallId)?.name ??
                    "Mall đã chọn"}
                </ERPStatusBadge>
              ) : (
                <Select value={workspaceMallId} onValueChange={changeMall}>
                  <SelectTrigger
                    className="h-8 w-full sm:w-64"
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
              <span className="text-[11px] text-muted-foreground">
                {t("workspace.sameMall")}
              </span>
            </div>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(400px,2fr)]">
          <main className="min-w-0 p-3 sm:p-4">
            <UnitFinder
              mallId={workspaceMallId}
              initialUnitId={initialUnitId}
              selectedUnit={selectedUnit}
              onSelect={selectUnit}
            />
          </main>

          <aside className="min-w-0 border-t border-border bg-card lg:border-l lg:border-t-0">
            <section className="border-b border-border p-3 sm:p-4">
              <PartyFinder
                mallId={workspaceMallId}
                selectedLead={selectedLead}
                onSelect={selectLead}
                onClear={() => setSelectedLead(null)}
              />
            </section>

            <section
              className="border-b border-border p-3 sm:p-4"
              aria-live="polite"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-foreground">
                  {t("workspace.bookingContext")}
                </h3>
                <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  {selectedLead && selectedUnit
                    ? t("workspace.ready")
                    : t("workspace.incomplete")}
                </span>
              </div>
              <div className="divide-y divide-border border-y border-border">
                {selectedUnit ? (
                  <div className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("workspace.selectedUnit")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold text-foreground">
                            {selectedUnit.code}
                            {selectedUnit.name ? ` — ${selectedUnit.name}` : ""}
                          </span>
                          <ERPStatusBadge
                            tone={
                              selectedUnit.currentEligibility.mode === "QUEUE"
                                ? "warning"
                                : selectedUnit.currentEligibility.selectable
                                  ? "success"
                                  : "danger"
                            }
                          >
                            {selectedUnit.currentEligibility.mode}
                          </ERPStatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedUnit.mall.name} ·{" "}
                          {selectedUnit.floor?.name ?? "Chưa có tầng"} ·{" "}
                          {selectedUnit.zone?.name ?? "Chưa có khu"}
                        </p>
                        <p className="text-xs font-medium tabular-nums text-foreground">
                          NLA:{" "}
                          {selectedUnit.areaNLA?.toLocaleString("vi-VN") ?? "—"}{" "}
                          m² · GFA:{" "}
                          {selectedUnit.areaGFA?.toLocaleString("vi-VN") ?? "—"}{" "}
                          m² · {selectedUnit.status}
                        </p>
                        {selectedUnit.currentEligibility.mode === "QUEUE" && (
                          <p className="mt-2 border-l-2 border-amber-500 pl-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                            Booking mới sẽ vào hàng chờ. Unit hiện đang được
                            giữ; kết quả cuối cùng do máy chủ xác nhận.
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
                  <div className="py-3 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">
                      {t("workspace.selectedUnit")}
                    </span>
                    <p className="mt-1">Chưa chọn Unit.</p>
                  </div>
                )}

                {selectedLead ? (
                  <div className="py-3">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("workspace.selectedCustomer")}
                        </p>
                        <p className="text-sm font-semibold text-foreground">
                          {selectedLead.brandName ||
                            selectedLead.company ||
                            "Lead chưa đặt tên"}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {selectedLead.contactName || "Chưa có người liên hệ"}
                          {selectedLead.phone ? ` · ${selectedLead.phone}` : ""}
                        </p>
                        {selectedLead.customer && (
                          <p className="text-xs text-muted-foreground">
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
                  <div className="py-3 text-xs text-muted-foreground">
                    <span className="font-semibold uppercase tracking-wide">
                      {t("workspace.selectedCustomer")}
                    </span>
                    <p className="mt-1">Chưa chọn Lead.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3 p-3 sm:p-4">
              <h3 className="text-sm font-semibold text-foreground">
                Chi tiết Booking
              </h3>
              <p className="text-xs text-muted-foreground">
                Dữ liệu có sẵn từ Lead đã được điền tự động. Chỉ điều chỉnh khi
                thông tin của Booking này khác với nhu cầu đã ghi nhận.
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
                  className="h-8 w-full rounded-md border border-input bg-background px-3 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            </section>

            {submitError && (
              <div
                role="alert"
                className="mx-3 mb-3 border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300 sm:mx-4"
              >
                {submitError} Dữ liệu đã nhập vẫn được giữ để bạn kiểm tra và
                thử lại.
              </div>
            )}
          </aside>
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-card px-4 py-3 sm:px-5">
          <div className="mr-auto hidden min-w-0 text-left sm:block">
            <p className="text-xs font-medium text-foreground">
              {!selectedLead && !selectedUnit
                ? t("workspace.readiness.needBoth")
                : !selectedLead
                  ? t("workspace.readiness.needCustomer")
                  : !selectedUnit
                    ? t("workspace.readiness.needUnit")
                    : !selectableUnit
                      ? t("workspace.readiness.unitUnavailable")
                      : selectedUnit.currentEligibility.mode === "QUEUE"
                        ? t("workspace.readiness.readyQueue")
                        : t("workspace.readiness.ready")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              POST /bookings xác nhận kết quả cuối cùng
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onClose}>
            Hủy
          </Button>
          <Button
            type="button"
            variant={canSubmit ? "default" : "secondary"}
            disabled={!canSubmit}
            onClick={() => mutation.mutate()}
            className="max-w-full gap-2 whitespace-normal text-center"
            aria-label={
              selectedUnit?.currentEligibility.mode === "QUEUE"
                ? "Tạo Booking vào hàng chờ"
                : "Tạo Booking"
            }
          >
            <BookmarkPlus className="h-4 w-4" aria-hidden="true" />
            {mutation.isPending ? "Đang tạo..." : "Tạo Booking"}
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
    <label className="block space-y-1 [&_button]:h-8 [&_input]:h-8 [&_input]:text-xs [&_textarea]:text-xs">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
