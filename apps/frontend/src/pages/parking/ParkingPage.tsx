import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CalendarClock,
  Car,
  CircleDollarSign,
  Download,
  FileText,
  Pencil,
  Plus,
  Receipt,
  Search,
  Upload,
} from "lucide-react";
import { parkingApi, tenantsApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { usePermission } from "@/hooks/usePermission";
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
  contractType: "FIXED_QUOTA",
  status: "DRAFT",
  startDate: "",
  endDate: "",
  signedDate: "",
  billingDay: 1,
  paymentTermDays: 15,
  depositAmount: 0,
  carQty: 0,
  carPrice: 0,
  carExcessPrice: 0,
  motorQty: 0,
  motorPrice: 0,
  motorExcessPrice: 0,
  notes: "",
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
    { hasRole } = usePermission(),
    selectedMallId = useMallStore((s) => s.selectedMallId),
    selectedMallName = useMallStore((s) => s.selectedMallName),
    openMallContextModal = useMallStore((s) => s.openMallContextModal);
  const mallId = selectedMallId || "";
  const canEdit = hasRole(["MALL_DIRECTOR", "OPERATION", "FINANCE", "LEASING_MANAGER"]);
  const canFinance = hasRole(["MALL_DIRECTOR", "FINANCE"]);
  const [view, setView] = useState<"contracts" | "debt" | "alerts">("contracts"),
    [open, setOpen] = useState(false),
    [editingId, setEditingId] = useState<string | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [form, setForm] = useState<any>(empty),
    [search, setSearch] = useState(""),
    [statusFilter, setStatusFilter] = useState(""),
    [adjustmentTarget, setAdjustmentTarget] = useState<any>(null),
    [adjustmentForm, setAdjustmentForm] = useState({ newQuantity: 0, unitPrice: 0, excessUnitPrice: 0, effectiveDate: new Date().toISOString().slice(0, 10), reason: "" }),
    [paymentTarget, setPaymentTarget] = useState<any>(null),
    [paymentForm, setPaymentForm] = useState({ amount: 0, paidAt: new Date().toISOString().slice(0, 10), method: "TRANSFER", referenceNo: "", notes: "" }),
    [statementTarget, setStatementTarget] = useState<any>(null),
    [statementEditId, setStatementEditId] = useState<string | null>(null),
    [statementForm, setStatementForm] = useState<any>({ actualQuantities: {}, adjustment: 0, notes: "" }),
    [statementPreview, setStatementPreview] = useState<any>(null),
    [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));

  useEffect(() => {
    setSelectedId(null);
    setOpen(false);
    setEditingId(null);
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
    qc.invalidateQueries({ predicate: (query) => String(query.queryKey[0]).startsWith("parking-") });
  };
  const action = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "create"
        ? parkingApi.createContract(data)
        : kind === "update"
          ? parkingApi.updateContract(data.id, data.payload)
        : kind === "status"
          ? parkingApi.updateStatus(data.id, data.status)
          : kind === "generate"
            ? parkingApi.generateStatement(data.id, { period, ...data.payload })
            : kind === "actual"
              ? parkingApi.updateActual(data.id, data.payload)
              : kind === "reconcile"
                ? parkingApi.reconcile(data.id, "MATCHED")
                : kind === "adjust"
                  ? parkingApi.adjustQuantity(data.id, data.payload)
                  : parkingApi.payment(data.id, data),
    onSuccess: () => {
      refresh();
      setOpen(false);
      setEditingId(null);
      setAdjustmentTarget(null);
      setPaymentTarget(null);
      setStatementTarget(null);
      setStatementEditId(null);
      setStatementPreview(null);
      toast({ title: "Đã cập nhật hợp đồng bãi xe" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật",
        description: e?.response?.data?.message || e?.message,
        variant: "destructive",
      }),
  });
  const previewAction = useMutation({
    mutationFn: ({ id, payload }: any) => parkingApi.previewStatement(id, { period, ...payload }),
    onSuccess: (data) => setStatementPreview(data),
    onError: (e: any) => toast({
      title: "Không thể xem trước công nợ",
      description: e?.response?.data?.message || e?.message,
      variant: "destructive",
    }),
  });
  const openStatementPreview = (contract: any) => {
    const actualQuantities = Object.fromEntries(
      contract.rates
        .filter((rate: any) => !rate.effectiveTo)
        .map((rate: any) => [
          rate.vehicleType,
          contract.contractType === "PRINCIPLE_ACTUAL" ? 0 : rate.registeredQuantity,
        ]),
    );
    const payload = { actualQuantities, adjustment: 0, notes: "" };
    setStatementTarget(contract);
    setStatementEditId(null);
    setStatementForm(payload);
    setStatementPreview(null);
    previewAction.mutate({ id: contract.id, payload });
  };
  const openStatementAdjustment = (statement: any) => {
    const payload = {
      actualQuantities: Object.fromEntries(statement.lines.map((line: any) => [line.vehicleType, line.actualQuantity])),
      adjustment: statement.adjustment || 0,
      notes: statement.notes || "",
    };
    setStatementTarget(statement.contract);
    setStatementEditId(statement.id);
    setStatementForm(payload);
    setStatementPreview(statement);
  };
  const saveContract = () => {
    if (!form.title?.trim() || !form.startDate || !form.endDate || (!editingId && (!form.tenantId || !form.contractNumber?.trim()))) {
      return toast({ title: "Vui lòng nhập đầy đủ các trường bắt buộc", variant: "destructive" });
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      return toast({ title: "Ngày kết thúc phải sau ngày bắt đầu", variant: "destructive" });
    }
    if (!editingId && !(form.carPrice || form.motorPrice)) {
      return toast({ title: "Cần ít nhất một dòng biểu phí", variant: "destructive" });
    }
    action.mutate({
      kind: editingId ? "update" : "create",
      data: editingId ? { id: editingId, payload: {
        title: form.title, signedDate: form.signedDate || null, startDate: form.startDate,
        endDate: form.endDate, billingDay: form.billingDay, paymentTermDays: form.paymentTermDays,
        depositAmount: form.depositAmount, notes: form.notes, contractType: form.contractType,
      } } : { ...form,
        rates: [
          ...(form.carPrice
            ? [
                {
                  vehicleType: "CAR",
                  registeredQuantity: form.contractType === "PRINCIPLE_ACTUAL" ? 0 : form.carQty,
                  unitPrice: form.carPrice,
                  excessUnitPrice: form.contractType === "PRINCIPLE_ACTUAL" ? 0 : form.carExcessPrice,
                },
              ]
            : []),
          ...(form.motorPrice
            ? [
                {
                  vehicleType: "MOTORBIKE",
                  registeredQuantity: form.contractType === "PRINCIPLE_ACTUAL" ? 0 : form.motorQty,
                  unitPrice: form.motorPrice,
                  excessUnitPrice: form.contractType === "PRINCIPLE_ACTUAL" ? 0 : form.motorExcessPrice,
                },
              ]
            : []),
        ],
      },
    });
  };
  const openEdit = (contract: any) => {
    setEditingId(contract.id);
    setForm({
      ...empty, mallId: contract.mallId, tenantId: contract.tenantId,
      contractNumber: contract.contractNumber, title: contract.title,
      status: contract.status,
      signedDate: contract.signedDate?.slice(0, 10) || "",
      startDate: contract.startDate?.slice(0, 10) || "", endDate: contract.endDate?.slice(0, 10) || "",
      billingDay: contract.billingDay, paymentTermDays: contract.paymentTermDays,
      depositAmount: contract.depositAmount, notes: contract.notes || "",
      contractType: contract.contractType || "FIXED_QUOTA",
    });
    setOpen(true);
  };
  const visibleContracts = contracts.filter((contract) => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term || [contract.contractNumber, contract.title, contract.tenant?.brandName].some((value) => String(value || "").toLowerCase().includes(term));
    return matchesSearch && (!statusFilter || contract.status === statusFilter);
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
          {canEdit && <Button
            onClick={() => {
              if (!mallId) {
                openMallContextModal();
                return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
              }
              setEditingId(null);
              setForm({ ...empty, mallId });
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo hợp đồng
          </Button>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["Hợp đồng hiệu lực", dash.active || 0, FileText, () => { setView("contracts"); setStatusFilter("ACTIVE"); }],
          ["Xe đăng ký", dash.registeredVehicles || 0, Car, () => { setView("contracts"); setStatusFilter(""); }],
          ["Doanh thu kỳ", money(dash.revenue), CircleDollarSign, () => setView("debt")],
          ["Công nợ", money(dash.receivable), Receipt, () => setView("debt")],
          ["Quá hạn", money(dash.overdue), AlertTriangle, () => setView("alerts")],
        ].map(([l, v, I, onClick]: any) => (
          <button key={l} onClick={onClick} className="rounded-lg border bg-card p-4 text-left transition hover:border-primary/40 hover:shadow-sm">
            <div className="flex justify-between text-sm text-muted-foreground">
              {l}
              <I className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-bold">{v}</div>
          </button>
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
          <div className="flex flex-wrap gap-2 border-b p-3">
            <div className="relative min-w-56 flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Tìm số HĐ, tên HĐ, khách thuê..." value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <select className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS).filter(([key]) => ["DRAFT", "ACTIVE", "SUSPENDED", "EXPIRED", "TERMINATED", "RENEWED"].includes(key)).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </div>
          <div className="divide-y">
            {visibleContracts.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted"
              >
                <div>
                  <div className="font-medium">
                    {c.contractNumber} · {c.tenant?.brandName}{" "}
                    <Badge variant="outline" className="ml-2">
                      {c.contractType === "PRINCIPLE_ACTUAL" ? "Nguyên tắc · theo thực tế" : "Định mức"}
                    </Badge>
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
            {!visibleContracts.length && <div className="p-10 text-center text-sm text-muted-foreground">Không có hợp đồng phù hợp</div>}
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
                    {canEdit && s.paidAmount === 0 && ["PENDING", "DISPUTED"].includes(s.reconciliationStatus) && (
                      <Button size="sm" variant="outline" onClick={() => openStatementAdjustment(s)}>
                        Xem / điều chỉnh
                      </Button>
                    )}
                    {canFinance && ["PENDING", "DISPUTED"].includes(s.reconciliationStatus) && (
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
                    {canFinance && s.status !== "PAID" && s.reconciliationStatus !== "TRANSFERRED_TO_BILLING" && (
                      <Button
                        size="sm"
                        onClick={() => {
                          setPaymentTarget(s);
                          setPaymentForm({ amount: Math.max(0, s.totalAmount - s.paidAmount), paidAt: new Date().toISOString().slice(0, 10), method: "TRANSFER", referenceNo: "", notes: "" });
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
            <DialogTitle>{editingId ? "Chỉnh sửa hợp đồng bãi xe" : "Tạo hợp đồng dịch vụ giữ xe"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Mall *">
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {selectedMallName}
              </div>
            </Label>
            <Select
              label="Loại hợp đồng *"
              value={form.contractType}
              disabled={!!editingId && form.status !== "DRAFT"}
              set={(v: string) => setForm({ ...form, contractType: v })}
              options={[
                ["FIXED_QUOTA", "Định mức + phí vượt (hiện hữu)"],
                ["PRINCIPLE_ACTUAL", "Nguyên tắc · thu theo xe thực tế"],
              ]}
            />
            <Select
              label="Khách thuê *"
              value={form.tenantId}
              disabled={!!editingId}
              set={(v: string) => setForm({ ...form, tenantId: v })}
              options={tenants.map((x: any) => [
                x.id,
                `${x.brandName} · ${x.companyName}`,
              ])}
            />
            <Label t="Số hợp đồng *">
              <Input
                disabled={!!editingId}
                value={form.contractNumber}
                onChange={(e) =>
                  setForm({ ...form, contractNumber: e.target.value })
                }
              />
            </Label>
            <Label t="Ngày ký">
              <Input type="date" value={form.signedDate} onChange={(e) => setForm({ ...form, signedDate: e.target.value })} />
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
            <Label t="Tiền đặt cọc">
              <Input type="number" min={0} value={form.depositAmount} onChange={(e) => setForm({ ...form, depositAmount: Number(e.target.value) })} />
            </Label>
            <Label t="Ghi chú">
              <textarea className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Label>
          </div>
          {!editingId && <><h3 className="font-semibold">Biểu phí</h3>
          {form.contractType === "PRINCIPLE_ACTUAL" && <p className="text-sm text-muted-foreground">Không khai báo định mức. Công nợ mỗi kỳ được tính bằng số xe thực tế × đơn giá.</p>}
          <div className={`grid items-center gap-2 text-sm ${form.contractType === "PRINCIPLE_ACTUAL" ? "grid-cols-2" : "grid-cols-4"}`}>
            <b>Loại xe</b>
            {form.contractType !== "PRINCIPLE_ACTUAL" && <b>Số đăng ký</b>}
            <b>Đơn giá/tháng</b>
            {form.contractType !== "PRINCIPLE_ACTUAL" && <b>Phí vượt/xe</b>}
            <span>Ô tô</span>
            {form.contractType !== "PRINCIPLE_ACTUAL" && <Input
              type="number"
              min={0}
              value={form.carQty}
              onChange={(e) =>
                setForm({ ...form, carQty: Number(e.target.value) })
              }
            />}
            <Input
              type="number"
              value={form.carPrice}
              onChange={(e) =>
                setForm({ ...form, carPrice: Number(e.target.value) })
              }
            />
            {form.contractType !== "PRINCIPLE_ACTUAL" && <Input type="number" min={0} value={form.carExcessPrice} onChange={(e) => setForm({ ...form, carExcessPrice: Number(e.target.value) })} />}
            <span>Xe máy</span>
            {form.contractType !== "PRINCIPLE_ACTUAL" && <Input
              type="number"
              min={0}
              value={form.motorQty}
              onChange={(e) =>
                setForm({ ...form, motorQty: Number(e.target.value) })
              }
            />}
            <Input
              type="number"
              value={form.motorPrice}
              onChange={(e) =>
                setForm({ ...form, motorPrice: Number(e.target.value) })
              }
            />
            {form.contractType !== "PRINCIPLE_ACTUAL" && <Input type="number" min={0} value={form.motorExcessPrice} onChange={(e) => setForm({ ...form, motorExcessPrice: Number(e.target.value) })} />}
          </div></>}
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Hủy</Button><Button onClick={saveContract} disabled={action.isPending}>{action.isPending ? "Đang lưu..." : "Lưu hợp đồng"}</Button></div>
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
                <Badge variant="outline">{detail.contractType === "PRINCIPLE_ACTUAL" ? "Nguyên tắc · theo thực tế" : "Định mức + phí vượt"}</Badge>
                {canEdit && !["EXPIRED", "TERMINATED", "RENEWED"].includes(detail.status) && <Button size="sm" variant="outline" onClick={() => { openEdit(detail); setSelectedId(null); }}><Pencil className="mr-1.5 h-3.5 w-3.5" />Chỉnh sửa</Button>}
                {canEdit && detail.status === "DRAFT" && (
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
                {canEdit && detail.status === "ACTIVE" && <Button size="sm" variant="outline" onClick={() => action.mutate({ kind: "status", data: { id: detail.id, status: "SUSPENDED" } })}>Tạm dừng</Button>}
                {canEdit && detail.status === "SUSPENDED" && <Button size="sm" onClick={() => action.mutate({ kind: "status", data: { id: detail.id, status: "ACTIVE" } })}>Kích hoạt lại</Button>}
                {canEdit && ["DRAFT", "ACTIVE", "SUSPENDED"].includes(detail.status) && <Button size="sm" variant="outline" className="text-destructive" onClick={() => action.mutate({ kind: "status", data: { id: detail.id, status: "TERMINATED" } })}>Chấm dứt</Button>}
                {canEdit && detail.status === "ACTIVE" && <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openStatementPreview(detail)}
                >
                  Xem trước công nợ {period}
                </Button>}
                {canEdit && <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm">
                  <Upload className="mr-2 h-4 w-4" />
                  Tải file hợp đồng
                  <input
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    className="hidden"
                    onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { await parkingApi.uploadDocument(detail.id, file); refresh(); toast({ title: "Đã tải tài liệu hợp đồng" }); } catch (error: any) { toast({ title: "Không thể tải tài liệu", description: error?.response?.data?.message, variant: "destructive" }); } finally { e.target.value = ""; } }}
                  />
                </label>}
              </div>
              <div className="grid gap-3 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Thời hạn</span><div className="font-medium">{new Date(detail.startDate).toLocaleDateString("vi-VN")} – {new Date(detail.endDate).toLocaleDateString("vi-VN")}</div></div>
                <div><span className="text-muted-foreground">Ngày lập phí</span><div className="font-medium">Ngày {detail.billingDay} hằng tháng</div></div>
                <div><span className="text-muted-foreground">Tiền đặt cọc</span><div className="font-medium">{money(detail.depositAmount)}</div></div>
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
                      <div className="text-sm text-muted-foreground">Phí vượt: {money(r.excessUnitPrice)}/xe</div>
                      {canEdit && detail.status === "ACTIVE" && <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAdjustmentTarget({ contractId: detail.id, rate: r });
                          setAdjustmentForm({ newQuantity: r.registeredQuantity, unitPrice: r.unitPrice, excessUnitPrice: r.excessUnitPrice, effectiveDate: new Date().toISOString().slice(0, 10), reason: "" });
                        }}
                      >
                        Điều chỉnh
                      </Button>}
                    </div>
                  ))}
              </div>
              <h3 className="font-semibold">Lịch sử điều chỉnh</h3>
              {detail.adjustments.map((a: any) => (
                <div key={a.id} className="border-b py-2 text-sm">
                  {new Date(a.effectiveDate).toLocaleDateString("vi-VN")} ·{" "}
                  {a.vehicleType}: {a.previousQuantity} → {a.newQuantity} ·{" "}
                  {a.reason}{a.createdBy?.fullName ? ` · ${a.createdBy.fullName}` : ""}
                </div>
              ))}
              <h3 className="font-semibold">Tài liệu</h3>
              {detail.documents.length ? detail.documents.map((doc: any) => <a key={doc.id} href={`/uploads/${doc.filePath}`} target="_blank" rel="noreferrer" className="flex items-center justify-between rounded-md border p-3 text-sm hover:bg-muted"><span><FileText className="mr-2 inline h-4 w-4" />{doc.fileName}</span><span className="text-muted-foreground">{Math.ceil(doc.fileSize / 1024)} KB</span></a>) : <p className="text-sm text-muted-foreground">Chưa có tài liệu hợp đồng</p>}
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!statementTarget} onOpenChange={(value) => { if (!value) { setStatementTarget(null); setStatementEditId(null); setStatementPreview(null); } }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{statementEditId ? "Xem và điều chỉnh công nợ" : "Xem trước công nợ Parking"}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
            <strong>{statementTarget?.tenant?.brandName}</strong>
            <Badge variant="outline">{statementTarget?.contractType === "PRINCIPLE_ACTUAL" ? "Nguyên tắc · theo thực tế" : "Định mức + phí vượt"}</Badge>
            <span>Kỳ {period}</span>
          </div>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left"><th className="p-3">Loại xe</th><th>Định mức</th><th>Thực tế</th><th>Đơn giá</th><th>Vượt</th><th className="pr-3 text-right">Thành tiền</th></tr></thead>
              <tbody>{(statementPreview?.lines || statementTarget?.rates?.filter((rate: any) => !rate.effectiveTo) || []).map((line: any) => {
                const vehicleType = line.vehicleType;
                const rate = statementTarget?.rates?.find((item: any) => item.vehicleType === vehicleType && !item.effectiveTo);
                const registered = line.registeredQuantity ?? rate?.registeredQuantity ?? 0;
                const unitPrice = line.unitPrice ?? rate?.unitPrice ?? 0;
                return <tr key={vehicleType} className="border-b">
                  <td className="p-3 font-medium">{vehicleType === "CAR" ? "Ô tô" : vehicleType === "MOTORBIKE" ? "Xe máy" : vehicleType}</td>
                  <td>{statementTarget?.contractType === "PRINCIPLE_ACTUAL" ? "—" : registered}</td>
                  <td><Input className="my-2 w-24" type="number" min={0} step={1} value={statementForm.actualQuantities[vehicleType] ?? 0} onChange={(e) => { setStatementForm({ ...statementForm, actualQuantities: { ...statementForm.actualQuantities, [vehicleType]: Number(e.target.value) } }); setStatementPreview(null); }} /></td>
                  <td>{money(unitPrice)}</td>
                  <td>{statementTarget?.contractType === "PRINCIPLE_ACTUAL" ? "—" : (line.excessQuantity ?? Math.max(0, (statementForm.actualQuantities[vehicleType] || 0) - registered))}</td>
                  <td className="pr-3 text-right font-medium">{statementPreview ? money(line.totalAmount) : "Tính lại"}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Điều chỉnh tăng/giảm"><Input type="number" value={statementForm.adjustment} onChange={(e) => { setStatementForm({ ...statementForm, adjustment: Number(e.target.value) }); setStatementPreview(null); }} /></Label>
            <Label t="Ghi chú"><Input value={statementForm.notes} onChange={(e) => setStatementForm({ ...statementForm, notes: e.target.value })} /></Label>
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="flex justify-between"><span>Tạm tính</span><strong>{statementPreview ? money(statementPreview.subtotal) : "Cần tính lại"}</strong></div>
            <div className="mt-1 flex justify-between"><span>Điều chỉnh</span><span>{statementPreview ? money(statementPreview.adjustment) : "—"}</span></div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base"><strong>Tổng phải thu</strong><strong>{statementPreview ? money(statementPreview.totalAmount) : "—"}</strong></div>
          </div>
          {!statementEditId && statementPreview?.existingStatement && <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">Công nợ kỳ này đã tồn tại. Hãy mở tab Công nợ để xem hoặc điều chỉnh.</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" onClick={() => previewAction.mutate({ id: statementTarget.id, payload: statementForm })} disabled={previewAction.isPending}>{previewAction.isPending ? "Đang tính..." : "Tính lại"}</Button>
            <Button disabled={!statementPreview || action.isPending || (!statementEditId && !!statementPreview.existingStatement)} onClick={() => action.mutate({ kind: statementEditId ? "actual" : "generate", data: { id: statementEditId || statementTarget.id, payload: statementForm } })}>{statementEditId ? "Lưu điều chỉnh" : "Xác nhận tạo công nợ"}</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!adjustmentTarget} onOpenChange={(value) => !value && setAdjustmentTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Điều chỉnh biểu phí {adjustmentTarget?.rate?.vehicleType}</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Số lượng đăng ký mới *"><Input type="number" min={0} value={adjustmentForm.newQuantity} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, newQuantity: Number(e.target.value) })} /></Label>
            <Label t="Ngày hiệu lực *"><Input type="date" value={adjustmentForm.effectiveDate} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, effectiveDate: e.target.value })} /></Label>
            <Label t="Đơn giá/tháng"><Input type="number" min={0} value={adjustmentForm.unitPrice} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, unitPrice: Number(e.target.value) })} /></Label>
            <Label t="Phí vượt/xe"><Input type="number" min={0} value={adjustmentForm.excessUnitPrice} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, excessUnitPrice: Number(e.target.value) })} /></Label>
            <label className="text-sm sm:col-span-2">Lý do điều chỉnh *<textarea className="mt-1 min-h-20 w-full rounded-md border bg-background px-3 py-2" value={adjustmentForm.reason} onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setAdjustmentTarget(null)}>Hủy</Button><Button disabled={action.isPending || !adjustmentForm.reason.trim()} onClick={() => action.mutate({ kind: "adjust", data: { id: adjustmentTarget.contractId, payload: { vehicleType: adjustmentTarget.rate.vehicleType, ...adjustmentForm } } })}>Lưu điều chỉnh</Button></div>
        </DialogContent>
      </Dialog>
      <Dialog open={!!paymentTarget} onOpenChange={(value) => !value && setPaymentTarget(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ghi nhận thanh toán Parking</DialogTitle></DialogHeader>
          <div className="rounded-md bg-muted p-3 text-sm"><div>{paymentTarget?.contract?.tenant?.brandName} · {paymentTarget?.period}</div><div className="mt-1 font-semibold">Còn nợ: {money(Math.max(0, (paymentTarget?.totalAmount || 0) - (paymentTarget?.paidAmount || 0)))}</div></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Label t="Số tiền *"><Input type="number" min={1} max={Math.max(0, (paymentTarget?.totalAmount || 0) - (paymentTarget?.paidAmount || 0))} value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })} /></Label>
            <Label t="Ngày thanh toán *"><Input type="date" value={paymentForm.paidAt} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} /></Label>
            <label className="text-sm">Hình thức<select className="mt-1 h-10 w-full rounded-md border bg-background px-3" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}><option value="TRANSFER">Chuyển khoản</option><option value="CASH">Tiền mặt</option><option value="OTHER">Khác</option></select></label>
            <Label t="Số tham chiếu"><Input value={paymentForm.referenceNo} onChange={(e) => setPaymentForm({ ...paymentForm, referenceNo: e.target.value })} /></Label>
            <label className="text-sm sm:col-span-2">Ghi chú<textarea className="mt-1 min-h-16 w-full rounded-md border bg-background px-3 py-2" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} /></label>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setPaymentTarget(null)}>Hủy</Button><Button disabled={action.isPending || paymentForm.amount <= 0} onClick={() => action.mutate({ kind: "payment", data: { id: paymentTarget.id, ...paymentForm } })}>Xác nhận thu tiền</Button></div>
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
function Select({ label, value, set, options, disabled }: any) {
  return (
    <label className="text-sm">
      {label}
      <select
        className="mt-1 h-10 w-full rounded-md border px-3"
        value={value}
        disabled={disabled}
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
