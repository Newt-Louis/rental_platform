import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  CircleDollarSign,
  Download,
  FileText,
  Plus,
  Receipt,
  Upload,
  Users,
} from "lucide-react";
import { parkingApi, tenantsApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
const empty = {
  mallId: "",
  tenantId: "",
  contractNumber: "",
  title: "Hợp đồng dịch vụ giữ xe",
  status: "DRAFT",
  startDate: "",
  endDate: "",
  billingDay: 1,
  paymentTermDays: 15,
  depositAmount: 0,
  carQty: 0,
  carPrice: 0,
  carExcessPrice: 0,
  motorQty: 0,
  motorPrice: 0,
  motorExcessPrice: 0,
};
const STATUS: Record<string, string> = {
  DRAFT: "Nháp",
  ACTIVE: "Hiệu lực",
  SUSPENDED: "Tạm dừng",
  EXPIRED: "Hết hạn",
  TERMINATED: "Chấm dứt",
  RENEWED: "Đã gia hạn",
  UNPAID: "Chưa thanh toán",
  PARTIAL: "Thanh toán một phần",
  PAID: "Đã thanh toán",
  OVERDUE: "Quá hạn",
};
const money = (v: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(v || 0);
export default function ParkingPage() {
  const qc = useQueryClient(),
    { toast } = useToast(),
    selectedMallId = useMallStore((s) => s.selectedMallId),
    selectedMallName = useMallStore((s) => s.selectedMallName),
    openMallContextModal = useMallStore((s) => s.openMallContextModal);
  const mallId = selectedMallId || "";
  const [view, setView] = useState<"contracts" | "debt" | "alerts">("contracts"),
    [open, setOpen] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [form, setForm] = useState<any>(empty),
    [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setSelectedId(null);
    setOpen(false);
    setForm({ ...empty, mallId });
  }, [mallId]);
  const tenantsQ = useQuery({
      queryKey: ["parking-tenants"],
      queryFn: () => tenantsApi.listTenants({ limit: 500 }),
    }),
    contractsQ = useQuery({
      queryKey: ["parking-contracts", mallId],
      queryFn: () => parkingApi.contracts(mallId ? { mallId } : undefined),
    }),
    debtQ = useQuery({
      queryKey: ["parking-statements", mallId, period],
      queryFn: () =>
        parkingApi.statements({
          ...(mallId && { mallId }),
          ...(period && { period }),
        }),
    }),
    dashQ = useQuery({
      queryKey: ["parking-dashboard", mallId, period],
      queryFn: () =>
        parkingApi.dashboard({
          ...(mallId && { mallId }),
          ...(period && { period }),
        }),
    }),
    alertsQ = useQuery({
      queryKey: ["parking-alerts", mallId],
      queryFn: () => parkingApi.alerts(mallId || undefined),
    }),
    detailQ = useQuery({
      queryKey: ["parking-contract", selectedId],
      queryFn: () => parkingApi.contract(selectedId!),
      enabled: !!selectedId,
    });
  const tenants: any[] = (tenantsQ.data as any)?.data || tenantsQ.data || [],
    contracts: any[] = contractsQ.data || [],
    debts: any[] = debtQ.data || [],
    dash: any = dashQ.data || {},
    alerts: any = alertsQ.data || {},
    detail: any = detailQ.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["parking"] });
  };
  const action = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "create"
        ? parkingApi.createContract(data)
        : kind === "status"
          ? parkingApi.updateStatus(data.id, data.status)
          : kind === "generate"
            ? parkingApi.generateStatement(data.id, { period })
            : kind === "actual"
              ? parkingApi.updateActual(data.id, {
                  actualQuantities: data.actualQuantities,
                })
              : kind === "reconcile"
                ? parkingApi.reconcile(data.id, "MATCHED")
                : parkingApi.payment(data.id, data),
    onSuccess: () => {
      refresh();
      setOpen(false);
      toast({ title: "Đã cập nhật hợp đồng bãi xe" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật",
        description: e?.response?.data?.message || e?.message,
        variant: "destructive",
      }),
  });
  const create = () =>
    action.mutate({
      kind: "create",
      data: {
        ...form,
        rates: [
          ...(form.carQty || form.carPrice
            ? [
                {
                  vehicleType: "CAR",
                  registeredQuantity: form.carQty,
                  unitPrice: form.carPrice,
                  excessUnitPrice: form.carExcessPrice || form.carPrice,
                },
              ]
            : []),
          ...(form.motorQty || form.motorPrice
            ? [
                {
                  vehicleType: "MOTORBIKE",
                  registeredQuantity: form.motorQty,
                  unitPrice: form.motorPrice,
                  excessUnitPrice: form.motorExcessPrice || form.motorPrice,
                },
              ]
            : []),
        ],
      },
    });
  const download = async (type: "debt" | "vehicles") => {
    const blob =
      type === "debt"
        ? await parkingApi.exportReceivables({ mallId, period })
        : await parkingApi.exportVehicles({ mallId, period });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `parking-${type}-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Car />
            Hợp đồng bãi xe & công nợ
          </h1>
          <p className="text-sm text-muted-foreground">
            Vòng đời hợp đồng · số xe đăng ký/phát sinh · tính phí · đối soát ·
            thanh toán
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => download("vehicles")}>
            <Download className="mr-2 h-4 w-4" />
            Phát sinh xe
          </Button>
          <Button variant="outline" onClick={() => download("debt")}>
            <Download className="mr-2 h-4 w-4" />
            Tổng hợp công nợ
          </Button>
          <Button
            onClick={() => {
              if (!mallId) {
                openMallContextModal();
                return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
              }
              setForm({ ...empty, mallId });
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo hợp đồng
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Hợp đồng hiệu lực", dash.active || 0, FileText],
          ["Xe đăng ký", dash.registeredVehicles || 0, Car],
          ["Doanh thu kỳ", money(dash.revenue), CircleDollarSign],
          ["Công nợ", money(dash.receivable), Receipt],
        ].map(([l, v, I]: any) => (
          <div key={l} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              {l}
              <I className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        <Input
          className="w-44"
          type="month"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
        />
        <div className="flex rounded-md border p-1">
          {[
            ["contracts", "Hợp đồng"],
            ["debt", "Công nợ"],
            ["alerts", "Cảnh báo"],
          ].map(([k, l]) => (
            <Button
              key={k}
              size="sm"
              variant={view === k ? "default" : "ghost"}
              onClick={() => setView(k as any)}
            >
              {l}
            </Button>
          ))}
        </div>
      </div>
      {view === "contracts" && (
        <div className="rounded-lg border bg-card">
          <div className="divide-y">
            {contracts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted"
              >
                <div>
                  <div className="font-medium">
                    {c.contractNumber} · {c.tenant?.brandName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {c.mall?.name} ·{" "}
                    {new Date(c.startDate).toLocaleDateString("vi-VN")} –{" "}
                    {new Date(c.endDate).toLocaleDateString("vi-VN")} ·{" "}
                    {c.rates
                      .map(
                        (r: any) => `${r.vehicleType}: ${r.registeredQuantity}`,
                      )
                      .join(" · ")}
                  </div>
                </div>
                <Badge>{STATUS[c.status] || c.status}</Badge>
              </button>
            ))}
          </div>
        </div>
      )}
      {view === "debt" && (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left">
                <th className="p-3">Khách thuê</th>
                <th>Kỳ</th>
                <th>Số xe</th>
                <th>Phải thu</th>
                <th>Đã thu</th>
                <th>Còn nợ</th>
                <th>Hạn</th>
                <th>Đối soát</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {debts.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="p-3">
                    {s.contract.tenant.brandName}
                    <div className="text-xs text-muted-foreground">
                      {s.contract.contractNumber}
                    </div>
                  </td>
                  <td>{s.period}</td>
                  <td>
                    {s.lines.reduce(
                      (n: number, l: any) => n + l.actualQuantity,
                      0,
                    )}
                  </td>
                  <td>{money(s.totalAmount)}</td>
                  <td>{money(s.paidAmount)}</td>
                  <td className="font-medium text-destructive">
                    {money(s.totalAmount - s.paidAmount)}
                  </td>
                  <td>{new Date(s.dueDate).toLocaleDateString("vi-VN")}</td>
                  <td>
                    <Badge variant="outline">{s.reconciliationStatus}</Badge>
                  </td>
                  <td className="space-x-1">
                    {s.reconciliationStatus !== "MATCHED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          action.mutate({ kind: "reconcile", data: s })
                        }
                      >
                        Đối soát
                      </Button>
                    )}
                    {s.status !== "PAID" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          const amount = prompt(
                            "Số tiền thanh toán",
                            String(s.totalAmount - s.paidAmount),
                          );
                          if (amount)
                            action.mutate({
                              kind: "payment",
                              data: {
                                id: s.id,
                                amount: Number(amount),
                                paidAt: new Date().toISOString(),
                                method: "TRANSFER",
                              },
                            });
                        }}
                      >
                        Thu tiền
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {view === "alerts" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <AlertBox
            title="Hợp đồng sắp hết hạn"
            icon={CalendarClock}
            rows={(alerts.expiring || []).map(
              (x: any) =>
                `${x.contractNumber} · ${x.tenant.brandName} · ${new Date(x.endDate).toLocaleDateString("vi-VN")}`,
            )}
          />
          <AlertBox
            title="Công nợ quá hạn"
            icon={AlertTriangle}
            rows={(alerts.overdue || []).map(
              (x: any) =>
                `${x.contract.tenant.brandName} · ${x.period} · ${money(x.totalAmount - x.paidAmount)}`,
            )}
          />
          <AlertBox
            title="Công nợ sắp đến hạn"
            icon={Receipt}
            rows={(alerts.dueSoon || []).map(
              (x: any) =>
                `${x.contract.tenant.brandName} · ${x.period} · ${money(x.totalAmount - x.paidAmount)}`,
            )}
          />
          <AlertBox
            title="Vượt số lượng đăng ký"
            icon={Car}
            rows={(alerts.excess || []).map(
              (x: any) =>
                `${x.statement.contract.tenant.brandName} · ${x.statement.period} · ${x.vehicleType}: +${x.excessQuantity}`,
            )}
          />
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo hợp đồng dịch vụ giữ xe</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Mall *">
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {selectedMallName}
              </div>
            </Label>
            <Select
              label="Khách thuê *"
              value={form.tenantId}
              set={(v: string) => setForm({ ...form, tenantId: v })}
              options={tenants.map((x: any) => [
                x.id,
                `${x.brandName} · ${x.companyName}`,
              ])}
            />
            <Label t="Số hợp đồng *">
              <Input
                value={form.contractNumber}
                onChange={(e) =>
                  setForm({ ...form, contractNumber: e.target.value })
                }
              />
            </Label>
            <Label t="Tên hợp đồng *">
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </Label>
            <Label t="Ngày bắt đầu *">
              <Input
                type="date"
                value={form.startDate}
                onChange={(e) =>
                  setForm({ ...form, startDate: e.target.value })
                }
              />
            </Label>
            <Label t="Ngày kết thúc *">
              <Input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              />
            </Label>
            <Label t="Ngày lập phí hằng tháng">
              <Input
                type="number"
                min={1}
                max={28}
                value={form.billingDay}
                onChange={(e) =>
                  setForm({ ...form, billingDay: Number(e.target.value) })
                }
              />
            </Label>
            <Label t="Hạn thanh toán (ngày)">
              <Input
                type="number"
                value={form.paymentTermDays}
                onChange={(e) =>
                  setForm({ ...form, paymentTermDays: Number(e.target.value) })
                }
              />
            </Label>
          </div>
          <h3 className="font-semibold">Biểu phí</h3>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <b>Loại xe</b>
            <b>Số đăng ký</b>
            <b>Đơn giá/tháng</b>
            <span>Ô tô</span>
            <Input
              type="number"
              value={form.carQty}
              onChange={(e) =>
                setForm({ ...form, carQty: Number(e.target.value) })
              }
            />
            <Input
              type="number"
              value={form.carPrice}
              onChange={(e) =>
                setForm({ ...form, carPrice: Number(e.target.value) })
              }
            />
            <span>Xe máy</span>
            <Input
              type="number"
              value={form.motorQty}
              onChange={(e) =>
                setForm({ ...form, motorQty: Number(e.target.value) })
              }
            />
            <Input
              type="number"
              value={form.motorPrice}
              onChange={(e) =>
                setForm({ ...form, motorPrice: Number(e.target.value) })
              }
            />
          </div>
          <Button onClick={create} disabled={action.isPending}>
            Lưu hợp đồng
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.contractNumber} · {detail?.tenant?.brandName}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge>{STATUS[detail.status]}</Badge>
                {detail.status === "DRAFT" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      action.mutate({
                        kind: "status",
                        data: { id: detail.id, status: "ACTIVE" },
                      })
                    }
                  >
                    Kích hoạt
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    action.mutate({ kind: "generate", data: detail })
                  }
                >
                  Tạo công nợ {period}
                </Button>
                <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Tải file hợp đồng
                  <input
                    type="file"
                    className="hidden"
                    onChange={(e) =>
                      e.target.files?.[0] &&
                      parkingApi
                        .uploadDocument(detail.id, e.target.files[0])
                        .then(refresh)
                    }
                  />
                </label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {detail.rates
                  .filter((r: any) => !r.effectiveTo)
                  .map((r: any) => (
                    <div className="rounded-md border p-3" key={r.id}>
                      <div className="font-medium">{r.vehicleType}</div>
                      <div>
                        Đăng ký: {r.registeredQuantity} xe ·{" "}
                        {money(r.unitPrice)}/xe
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          const q = prompt(
                              "Số lượng đăng ký mới",
                              String(r.registeredQuantity),
                            ),
                            reason = q && prompt("Lý do điều chỉnh");
                          if (q && reason)
                            parkingApi
                              .adjustQuantity(detail.id, {
                                vehicleType: r.vehicleType,
                                newQuantity: Number(q),
                                reason,
                              })
                              .then(refresh);
                        }}
                      >
                        Điều chỉnh
                      </Button>
                    </div>
                  ))}
              </div>
              <h3 className="font-semibold">Lịch sử điều chỉnh</h3>
              {detail.adjustments.map((a: any) => (
                <div key={a.id} className="border-b py-2 text-sm">
                  {new Date(a.effectiveDate).toLocaleDateString("vi-VN")} ·{" "}
                  {a.vehicleType}: {a.previousQuantity} → {a.newQuantity} ·{" "}
                  {a.reason}
                </div>
              ))}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function Label({ t, children }: any) {
  return (
    <label className="text-sm">
      {t}
      {children}
    </label>
  );
}
function Select({ label, value, set, options }: any) {
  return (
    <label className="text-sm">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border px-3"
        value={value}
        onChange={(e) => set(e.target.value)}
      >
        <option value="">Chọn</option>
        {options.map((x: any) => (
          <option key={x[0]} value={x[0]}>
            {x[1]}
          </option>
        ))}
      </select>
    </label>
  );
}
function AlertBox({ title, icon: Icon, rows }: any) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 flex items-center gap-2 font-semibold">
        <Icon className="h-4 w-4" />
        {title}
        <Badge variant="secondary">{rows.length}</Badge>
      </h3>
      {rows.length ? (
        rows.map((x: string, i: number) => (
          <div key={i} className="border-b py-2 text-sm">
            {x}
          </div>
        ))
      ) : (
        <p className="text-sm text-muted-foreground">Không có cảnh báo</p>
      )}
    </div>
  );
}
