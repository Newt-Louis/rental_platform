import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Download, FileText, Pencil, Plus, Search, Upload, X } from "lucide-react";
import { serviceContractsApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { openAuthenticatedFile } from "@/lib/downloadFile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { useTranslation } from "react-i18next";
import { usePermission } from "@/hooks/usePermission";
import type { Role } from "@/types";
import { formatMoney, formatMoneyAmount, type CurrencyCode } from "@/lib/currency";
import { serviceContractTypeTranslationKey } from "@/lib/erpEnumPresentation";

const STATUSES = [
  "DRAFT",
  "PROPOSAL",
  "UNDER_REVIEW",
  "PENDING_SIGNATURE",
  "ACTIVE",
  "EXPIRING",
  "EXPIRED",
  "TERMINATED",
  "RENEWED",
  "CANCELLED",
];
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["PROPOSAL", "UNDER_REVIEW", "CANCELLED"],
  PROPOSAL: ["DRAFT", "UNDER_REVIEW", "PENDING_SIGNATURE", "CANCELLED"],
  UNDER_REVIEW: ["DRAFT", "PROPOSAL", "PENDING_SIGNATURE", "CANCELLED"],
  PENDING_SIGNATURE: ["UNDER_REVIEW", "ACTIVE", "CANCELLED"],
  ACTIVE: ["EXPIRING", "EXPIRED", "TERMINATED"],
  EXPIRING: ["ACTIVE", "EXPIRED", "TERMINATED"],
  EXPIRED: [],
  TERMINATED: [],
  RENEWED: [],
  CANCELLED: [],
};
const TYPES = [
  "SERVICE",
  "SUPPLY",
  "LABOR",
  "MAINTENANCE",
  "CONSTRUCTION",
  "CONSULTING",
  "PARTNERSHIP",
  "CONFIDENTIALITY",
  "SOFTWARE",
  "INSURANCE",
  "SECURITY",
  "CLEANING",
  "OTHER",
];
const SERVICE_CATEGORIES = [
  ["CLEANING", "Vệ sinh"],
  ["SECURITY", "An ninh / bảo vệ"],
  ["MAINTENANCE", "Bảo trì"],
  ["TECHNICAL", "Kỹ thuật"],
  ["IT_SOFTWARE", "CNTT / phần mềm"],
  ["CONSULTING", "Tư vấn"],
  ["INSURANCE", "Bảo hiểm"],
  ["CONSTRUCTION", "Xây dựng"],
  ["LABOR_SUPPLY", "Cung ứng nhân sự"],
  ["MARKETING", "Marketing / truyền thông"],
  ["PARKING", "Bãi xe"],
  ["LANDSCAPING", "Cảnh quan"],
  ["PEST_CONTROL", "Kiểm soát côn trùng"],
  ["WASTE_MANAGEMENT", "Thu gom / xử lý chất thải"],
  ["UTILITIES", "Điện, nước và tiện ích"],
  ["OTHER", "Dịch vụ khác"],
] as const;
const VALUE_BASES = [
  ["ONE_TIME", "Trọn gói / một lần"],
  ["MONTHLY", "Theo tháng"],
  ["QUARTERLY", "Theo quý"],
  ["ANNUAL", "Theo năm"],
  ["PROJECT", "Theo dự án"],
  ["OTHER", "Cơ sở khác"],
] as const;
const categoryLabel = (value: string) => SERVICE_CATEGORIES.find(([key]) => key === value)?.[1] ?? value;
const valueBasisLabel = (value: string) => VALUE_BASES.find(([key]) => key === value)?.[1] ?? value;
const labels: Record<string, string> = {
  DRAFT: "Nháp",
  PROPOSAL: "Đề xuất",
  UNDER_REVIEW: "Đang duyệt",
  PENDING_SIGNATURE: "Chờ ký",
  ACTIVE: "Hiệu lực",
  EXPIRING: "Sắp hết hạn",
  EXPIRED: "Hết hạn",
  TERMINATED: "Đã chấm dứt",
  RENEWED: "Đã gia hạn",
  CANCELLED: "Đã hủy",
};
const STATUS_DESCRIPTIONS: Record<string, string> = {
  DRAFT: "Hồ sơ đang được soạn thảo và bổ sung thông tin; chưa đưa vào quy trình phê duyệt.",
  PROPOSAL: "Điều khoản thương mại đang ở bước đề xuất, trao đổi hoặc thương lượng với các bên.",
  UNDER_REVIEW: "Hồ sơ đang được các bộ phận liên quan kiểm tra và phê duyệt nội bộ.",
  PENDING_SIGNATURE: "Nội dung đã hoàn thiện và đang chờ các bên ký hợp đồng pháp lý.",
  ACTIVE: "Hợp đồng đã có hiệu lực; các nghĩa vụ, thanh toán và mốc thực hiện đang được theo dõi.",
  EXPIRING: "Hợp đồng sắp đến ngày kết thúc; cần quyết định gia hạn, kết thúc hoặc chấm dứt.",
  EXPIRED: "Hợp đồng đã qua ngày kết thúc và không còn hiệu lực thực hiện.",
  TERMINATED: "Hợp đồng đã được chấm dứt trước hạn theo quyết định hoặc thỏa thuận của các bên.",
  RENEWED: "Hợp đồng đã được thay thế hoặc tiếp nối bằng một hợp đồng gia hạn mới.",
  CANCELLED: "Hồ sơ đã bị hủy và không tiếp tục quy trình ký kết hoặc thực hiện.",
};
const LIFECYCLE_FLOW = ["DRAFT", "PROPOSAL", "UNDER_REVIEW", "PENDING_SIGNATURE", "ACTIVE", "EXPIRING", "EXPIRED"];

export default function ServiceContractsPage() {
  const { t } = useTranslation("serviceContracts");
  const { selectedMallId } = useMallStore();
  const { hasRole } = usePermission();
  const canEdit = hasRole(["MALL_DIRECTOR", "LEASING_MANAGER", "LEGAL", "OPERATION"] as Role[]);
  const canTransferToBilling = hasRole(["MALL_DIRECTOR", "LEASING_MANAGER", "LEGAL", "OPERATION", "FINANCE"] as Role[]);
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [serviceCategory, setServiceCategory] = useState("");
  const [valueBasis, setValueBasis] = useState("");
  const [paymentDirection, setPaymentDirection] = useState("");
  const [alert, setAlert] = useState("");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createPaymentDirection, setCreatePaymentDirection] = useState("PAYABLE");
  const [createOriginalFile, setCreateOriginalFile] = useState<File>();
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  useEffect(() => {
    setSelectedId(null);
    setShowEdit(false);
    setShowRenew(false);
    setPage(1);
  }, [selectedMallId]);
  const list = useQuery({
    queryKey: ["service-contracts", selectedMallId, search, status, type, serviceCategory, valueBasis, paymentDirection, alert, page],
    queryFn: () =>
      serviceContractsApi.list({
        mallId: selectedMallId || undefined,
        search: search || undefined,
        status: status || undefined,
        type: type || undefined,
        serviceCategory: serviceCategory || undefined,
        valueBasis: valueBasis || undefined,
        paymentDirection: paymentDirection || undefined,
        alert: alert || undefined,
        alertDays: 30,
        page,
        limit: 25,
      }),
  });
  const alertSummary = useQuery({ queryKey: ["service-contract-alerts", selectedMallId], queryFn: () => serviceContractsApi.alerts(30, selectedMallId || undefined) });
  const detail = useQuery({
    queryKey: ["service-contract", selectedId],
    queryFn: () => serviceContractsApi.detail(selectedId!),
    enabled: !!selectedId,
  });
  const rows = (list.data as any)?.data ?? [];
  const total = (list.data as any)?.total ?? 0;
  const totalPages = (list.data as any)?.totalPages ?? 1;
  const alertData = (alertSummary.data as any)?.data ?? alertSummary.data ?? {};
  // Axios unwraps non-paginated API responses, while paginated lists keep `data`.
  const item = (detail.data as any)?.data ?? detail.data;
  useEffect(() => setPendingStatus(null), [selectedId, item?.status]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["service-contracts"] });
    qc.invalidateQueries({ queryKey: ["service-contract-alerts"] });
    qc.invalidateQueries({ queryKey: ["service-contract"] });
  };
  const create = useMutation({
    mutationFn: async ({ data, originalFile }: { data: Record<string, unknown>; originalFile?: File }) => {
      const response = await serviceContractsApi.create(data);
      const created = (response as any)?.data ?? response;
      let uploadError: unknown;
      if (originalFile && created?.id) {
        try {
          await serviceContractsApi.upload(created.id, originalFile, "CONTRACT");
        } catch (error) {
          uploadError = error;
        }
      }
      return { created, uploadError };
    },
    onSuccess: ({ created, uploadError }) => {
      setSearch("");
      setStatus(created?.status || "DRAFT");
      setType("");
      setServiceCategory("");
      setValueBasis("");
      setPaymentDirection("");
      setAlert("");
      setPage(1);
      refresh();
      setShowCreate(false);
      setCreateOriginalFile(undefined);
      if (created?.id) setSelectedId(created.id);
      toast(uploadError ? {
        title: "Đã tạo hợp đồng nhưng chưa tải được bản gốc",
        description: "Hợp đồng đã được lưu. Vui lòng thử tải lại tài liệu trong hồ sơ hợp đồng.",
        variant: "destructive",
      } : { title: "Đã tạo hợp đồng dịch vụ và lưu bản gốc" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể tạo hợp đồng",
        description: e?.response?.data?.message,
        variant: "destructive",
      }),
  });
  const changeStatus = useMutation({
    mutationFn: (next: string) =>
      serviceContractsApi.updateStatus(selectedId!, next),
    onSuccess: () => {
      setPendingStatus(null);
      refresh();
      toast({ title: "Đã cập nhật trạng thái hợp đồng" });
    },
    onError: (e: any) =>
      toast({
        title: "Chuyển trạng thái không hợp lệ",
        description: e?.response?.data?.message,
        variant: "destructive",
      }),
  });
  const update = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      serviceContractsApi.update(selectedId!, data),
    onSuccess: () => {
      refresh();
      setShowEdit(false);
      toast({ title: "Đã cập nhật hợp đồng dịch vụ" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật hợp đồng",
        description: e?.response?.data?.message,
        variant: "destructive",
      }),
  });
  const renew = useMutation({
    mutationFn: (data: Record<string, unknown>) => serviceContractsApi.renew(selectedId!, data),
    onSuccess: (response: any) => {
      const renewed = response?.data ?? response;
      refresh();
      setShowRenew(false);
      if (renewed?.id) setSelectedId(renewed.id);
      toast({ title: "Đã tạo hợp đồng gia hạn" });
    },
    onError: (e: any) => toast({
      title: "Không thể gia hạn hợp đồng",
      description: e?.response?.data?.message,
      variant: "destructive",
    }),
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.delete("originalDocument");
    const raw = Object.fromEntries(formData.entries());
    const data = Object.fromEntries(
      Object.entries(raw).filter(([, value]) => value !== ""),
    ) as Record<string, unknown>;
    for (const key of ["totalValue", "invoiceLeadDays", "defaultVatRate", "paymentTermDays"]) {
      if (data[key] !== undefined) data[key] = Number(String(data[key]).replace(/,/g, ""));
    }
    create.mutate({
      data,
      originalFile: createOriginalFile,
    });
  }
  function submitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const data = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== "")) as Record<string, unknown>;
    for (const key of ["totalValue", "invoiceLeadDays", "defaultVatRate", "paymentTermDays"]) {
      if (data[key] !== undefined) data[key] = Number(String(data[key]).replace(/,/g, ""));
    }
    update.mutate(data);
  }
  function submitRenew(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const raw = Object.fromEntries(new FormData(e.currentTarget).entries());
    const data = Object.fromEntries(Object.entries(raw).filter(([, value]) => value !== "")) as Record<string, unknown>;
    if (data.totalValue !== undefined) data.totalValue = Number(String(data.totalValue).replace(/,/g, ""));
    renew.mutate(data);
  }
  async function upload(file?: File) {
    if (!file || !selectedId) return;
    try {
      await serviceContractsApi.upload(selectedId, file);
      refresh();
      toast({ title: "Đã lưu tài liệu hợp đồng" });
    } catch (e: any) {
      toast({
        title: "Không thể tải tài liệu",
        description: e?.response?.data?.message || "Vui lòng kiểm tra định dạng, dung lượng file và thử lại.",
        variant: "destructive",
      });
    }
  }
  async function exportExcel() {
    setExporting(true);
    try {
      const blob = await serviceContractsApi.exportExcel({
        mallId: selectedMallId || undefined,
        search: search || undefined,
        status: status || undefined,
        type: type || undefined,
        serviceCategory: serviceCategory || undefined,
        valueBasis: valueBasis || undefined,
        paymentDirection: paymentDirection || undefined,
        alert: alert || undefined,
        alertDays: 30,
      });
      const url = URL.createObjectURL(blob as Blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `ServiceContracts_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Đã xuất báo cáo Excel hợp đồng dịch vụ" });
    } catch (error: any) {
      toast({ title: "Không thể xuất Excel", description: error?.response?.data?.message || error?.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportExcel} disabled={exporting}>
            <Download size={16} className="mr-2" />
            {exporting ? "Đang xuất..." : "Xuất Excel"}
          </Button>
          {canEdit && <Button onClick={() => setShowCreate(true)} disabled={!selectedMallId}>
            <Plus size={16} className="mr-2" />
            {t("create")}
          </Button>}
        </div>
      </div>
      {!selectedMallId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-800">
          Đang xem tổng hợp hợp đồng của tất cả Mall được phân quyền. Chọn một Mall cụ thể để tạo hợp đồng mới.
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["EXPIRING", "Sắp hết hạn", alertData.expiring || 0, "border-amber-200 bg-amber-50 text-amber-800"],
          ["RECEIVABLE", "Kỳ phải thu sắp đến", alertData.receivableDue || 0, "border-emerald-200 bg-emerald-50 text-emerald-800"],
          ["PAYABLE", "Kỳ phải trả sắp đến", alertData.payableDue || 0, "border-blue-200 bg-blue-50 text-blue-800"],
          ["OVERDUE", "Kỳ đã quá hạn", alertData.overdue || 0, "border-red-200 bg-red-50 text-red-800"],
        ].map(([key, title, count, color]) => <button key={String(key)} className={`rounded-lg border p-4 text-left ${color} ${alert === key || paymentDirection === key ? "ring-2 ring-primary" : ""}`} onClick={() => { setPage(1); setStatus(""); if (key === "RECEIVABLE" || key === "PAYABLE") { setPaymentDirection(String(key)); setAlert("PAYMENT_DUE"); } else { setPaymentDirection(""); setAlert(String(key)); } }}>
          <div className="flex items-center justify-between text-sm font-medium"><span>{title}</span>{key === "OVERDUE" ? <AlertTriangle size={18} /> : <Clock size={18} />}</div>
          <div className="mt-2 text-2xl font-semibold">{String(count)}</div><div className="text-xs opacity-75">Trong 30 ngày tới</div>
        </button>)}
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="relative max-w-md flex-1">
          <Search
            className="absolute left-3 top-2.5 text-muted-foreground"
            size={16}
          />
          <Input
            className="pl-9"
            placeholder={t("search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="rounded-md border bg-background px-3 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setAlert(""); setPage(1); }}
        >
          <option value="">{t("allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`statuses.${s}`)}
            </option>
          ))}
        </select>
        <select className="rounded-md border bg-background px-3 text-sm" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}><option value="">Tất cả loại hợp đồng</option>{TYPES.map(value => <option key={value} value={value}>{t(serviceContractTypeTranslationKey(value))}</option>)}</select>
        <select className="rounded-md border bg-background px-3 text-sm" value={serviceCategory} onChange={(e) => { setServiceCategory(e.target.value); setPage(1); }}><option value="">Tất cả nhóm dịch vụ</option>{SERVICE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="rounded-md border bg-background px-3 text-sm" value={valueBasis} onChange={(e) => { setValueBasis(e.target.value); setPage(1); }}><option value="">Tất cả cơ sở giá trị</option>{VALUE_BASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select className="rounded-md border bg-background px-3 text-sm" value={paymentDirection} onChange={(e) => { setPaymentDirection(e.target.value); setAlert(""); setPage(1); }}><option value="">Tất cả phải thu / phải trả</option><option value="RECEIVABLE">Hợp đồng phải thu</option><option value="PAYABLE">Hợp đồng phải trả</option></select>
        {(alert || type || serviceCategory || valueBasis || paymentDirection || status) && <Button variant="outline" onClick={() => { setStatus(""); setType(""); setServiceCategory(""); setValueBasis(""); setPaymentDirection(""); setAlert(""); setPage(1); }}>Đặt lại bộ lọc</Button>}
      </div>
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>Hiển thị {rows.length} / {total.toLocaleString("vi-VN")} hợp đồng</span><span>Mặc định: tất cả trạng thái</span></div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3">{t("number")}</th>
              <th>{t("contractPartner")}</th>
              <th>{t("type")}</th>
              <th>{t("term")}</th>
              <th className="text-right">{t("value")}</th>
              <th className="px-3">{t("statusLabel")}</th>
              <th>{t("files")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c: any) => (
              <tr
                key={c.id}
                className="cursor-pointer border-t hover:bg-muted/40"
                onClick={() => setSelectedId(c.id)}
              >
                <td className="p-3 font-mono font-medium">
                  {c.contractNumber}
                </td>
                <td>
                  <div className="font-medium">{c.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.counterpartyName}
                  </div>
                </td>
                <td><div>{categoryLabel(c.serviceCategory || c.type)}</div><div className="text-xs text-muted-foreground">{t(serviceContractTypeTranslationKey(c.type))}</div></td>
                <td>
                  {c.startDate
                    ? new Date(c.startDate).toLocaleDateString()
                    : "—"}{" "}
                  – {c.endDate ? new Date(c.endDate).toLocaleDateString() : "—"}
                </td>
                <td className="text-right">
                  {formatMoneyAmount(Number(c.totalValue), c.currency as CurrencyCode)} {c.currency}
                  <div className="text-xs text-muted-foreground">{valueBasisLabel(c.valueBasis || "ONE_TIME")}</div>
                </td>
                <td className="px-3">
                  <Badge variant="outline">{t(`statuses.${c.status}`)}</Badge>
                </td>
                <td>{c._count?.documents || 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <div className="p-12 text-center text-muted-foreground">
            <FileText className="mx-auto mb-2 opacity-30" />
            {t("empty")}
          </div>
        )}
      </div>
      {totalPages > 1 && <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"><span>Trang {page} / {totalPages}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Trang trước</Button><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Trang sau</Button></div></div>}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={submit}
            className="grid max-h-[92vh] w-full max-w-4xl grid-cols-2 gap-4 overflow-y-auto rounded-xl bg-background p-6 shadow-xl"
          >
            <div className="col-span-2 flex justify-between border-b pb-4">
              <div>
                <h2 className="text-xl font-semibold">Tạo hợp đồng dịch vụ</h2>
                <p className="text-sm text-muted-foreground">Nhập đầy đủ thông tin pháp lý, tài chính và bản gốc trong một lần.</p>
              </div>
              <button type="button" onClick={() => { setShowCreate(false); setCreateOriginalFile(undefined); }}>
                <X />
              </button>
            </div>
            <h3 className="col-span-2 font-semibold">Thông tin pháp lý</h3>
            <label className="text-sm">Số hợp đồng pháp lý *<Input name="contractNumber" required placeholder="Nhập đúng số trên hợp đồng đã/phải ký" /></label>
            <label className="text-sm">Tên hợp đồng *<Input name="title" required placeholder="Tên hợp đồng" /></label>
            <label className="text-sm">Tên đối tác *<Input name="counterpartyName" required placeholder="Tên pháp lý của đối tác" /></label>
            <label className="text-sm">Mã số thuế<Input name="counterpartyTax" placeholder="Mã số thuế" /></label>
            <label className="text-sm">Email<Input name="counterpartyEmail" type="email" placeholder="Email đối tác" /></label>
            <label className="text-sm">Điện thoại<Input name="counterpartyPhone" placeholder="Số điện thoại" /></label>
            <label className="col-span-2 text-sm">Địa chỉ<Input name="counterpartyAddress" placeholder="Địa chỉ pháp lý" /></label>

            <h3 className="col-span-2 mt-2 border-t pt-4 font-semibold">Phân loại và giá trị</h3>
            <label className="text-sm">Loại hợp đồng<select name="type" className="mt-1 h-10 w-full rounded-md border bg-background px-3">{TYPES.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="text-sm">Chiều thanh toán<select name="paymentDirection" value={createPaymentDirection} onChange={(e) => setCreatePaymentDirection(e.target.value)} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="PAYABLE">Hợp đồng phải trả</option><option value="RECEIVABLE">Hợp đồng phải thu</option></select></label>
            <label className="text-sm">Nhóm sản phẩm/dịch vụ *<select name="serviceCategory" required defaultValue="MAINTENANCE" className="mt-1 h-10 w-full rounded-md border bg-background px-3">{SERVICE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">Mô tả chi tiết sản phẩm/dịch vụ<Input name="productName" placeholder="Thông tin chi tiết (không dùng để phân nhóm báo cáo)" /></label>
            <label className="text-sm">Giá trị hợp đồng *<Input name="totalValue" type="number" min="0" required placeholder="Giá trị chưa/đã gồm VAT theo hợp đồng" /></label>
            <label className="text-sm">Cơ sở giá trị *<select name="valueBasis" required defaultValue="ONE_TIME" className="mt-1 h-10 w-full rounded-md border bg-background px-3">{VALUE_BASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">Tiền tệ<select name="currency" defaultValue="VND" className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="VND">VND</option><option value="USD">USD</option><option value="MMK">MMK</option></select></label>
            <label className="text-sm">Ngày ký<Input name="signedDate" type="date" /></label>
            <label className="text-sm">
              Ngày bắt đầu
              <Input name="startDate" type="date" />
            </label>
            <label className="text-sm">
              Ngày kết thúc
              <Input name="endDate" type="date" />
            </label>

            {createPaymentDirection === "RECEIVABLE" && <>
              <label className="text-sm">Xuất hóa đơn trước (ngày)<Input name="invoiceLeadDays" type="number" min="0" defaultValue={7} /></label>
              <label className="text-sm">VAT mặc định (%)<Input name="defaultVatRate" type="number" min="0" max="100" defaultValue={10} /></label>
              <label className="text-sm">Hạn thanh toán (ngày)<Input name="paymentTermDays" type="number" min="0" defaultValue={15} /></label>
            </>}

            <h3 className="col-span-2 mt-2 border-t pt-4 font-semibold">Tài liệu và ghi chú</h3>
            <label className="col-span-2 rounded-lg border border-dashed p-4 text-sm">
              <span className="mb-2 block font-medium">Hợp đồng bản gốc</span>
              <span className="mb-3 block text-xs text-muted-foreground">PDF, Word hoặc ảnh; tối đa 30 MB. File sẽ được lưu ngay sau khi tạo hồ sơ.</span>
              <Input
                name="originalDocument"
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={(event) => setCreateOriginalFile(event.target.files?.[0])}
              />
            </label>
            <textarea
              name="notes"
              className="col-span-2 min-h-20 rounded-md border bg-background p-3"
              placeholder="Ghi chú"
            />
            <input type="hidden" name="mallId" value={selectedMallId || ""} />
            <div className="col-span-2 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => { setShowCreate(false); setCreateOriginalFile(undefined); }}
              >
                Hủy
              </Button>
              <Button disabled={create.isPending}>{create.isPending ? "Đang tạo và lưu tài liệu..." : "Tạo hợp đồng"}</Button>
            </div>
          </form>
        </div>
      )}
      {selectedId && item && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
          <div className="h-full w-full max-w-2xl overflow-y-auto bg-background p-6 shadow-xl">
            <div className="flex justify-between">
              <div>
                <div className="font-mono text-sm text-muted-foreground">
                  {item.contractNumber}
                </div>
                <h2 className="text-xl font-semibold">{item.title}</h2>
              </div>
              <div className="flex gap-2">
                {canEdit && <Button size="sm" variant="outline" onClick={() => setShowEdit(true)}><Pencil size={14} className="mr-2" />Chỉnh sửa</Button>}
                {canEdit && ["EXPIRING", "EXPIRED"].includes(item.status) && <Button size="sm" onClick={() => setShowRenew(true)}>Gia hạn</Button>}
                <button onClick={() => setSelectedId(null)}><X /></button>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 rounded-lg border p-4 text-sm">
              <div>
                <span className="text-muted-foreground">Đối tác</span>
                <div className="font-medium">{item.counterpartyName}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Giá trị</span>
                <div className="font-medium">
                  {formatMoney(Number(item.totalValue), item.currency as CurrencyCode)}
                </div>
                <div className="text-xs text-muted-foreground">{valueBasisLabel(item.valueBasis || "ONE_TIME")}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Nhóm dịch vụ</span>
                <div className="font-medium">{categoryLabel(item.serviceCategory || "OTHER")}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Bắt đầu</span>
                <div>
                  {item.startDate
                    ? new Date(item.startDate).toLocaleDateString("vi-VN")
                    : "—"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Kết thúc</span>
                <div>
                  {item.endDate
                    ? new Date(item.endDate).toLocaleDateString("vi-VN")
                    : "—"}
                </div>
              </div>
            </div>
            <div className="mt-5">
              <ContractLifecycle
                status={item.status}
                canEdit={canEdit}
                pendingStatus={pendingStatus}
                isPending={changeStatus.isPending}
                onSelect={setPendingStatus}
                onCancel={() => setPendingStatus(null)}
                onConfirm={() => pendingStatus && changeStatus.mutate(pendingStatus)}
              />
            </div>
            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="font-semibold">Tài liệu hợp đồng</h3>
                {canEdit && <label className="cursor-pointer rounded-md border px-3 py-2 text-sm">
                  <Upload className="mr-2 inline" size={14} />
                  Upload
                  <input
                    className="hidden"
                    type="file"
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                    onChange={(e) => upload(e.target.files?.[0])}
                  />
                </label>}
              </div>
              <div className="divide-y rounded-lg border">
                {item.documents?.map((d: any) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => openAuthenticatedFile(`/files/service-contract-documents/${d.id}`)}
                    className="flex w-full justify-between p-3 text-left hover:bg-muted"
                  >
                    <span>{d.fileName}</span>
                    <span className="text-xs text-muted-foreground">
                      v{d.version} · {(d.fileSize / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </button>
                ))}
                {!item.documents?.length && (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    Chưa có tài liệu
                  </div>
                )}
              </div>
            </div>
            <ContractOperations item={item} onChanged={refresh} canEdit={canEdit} canTransferToBilling={canTransferToBilling} />
            <div className="mt-6">
              <h3 className="mb-2 font-semibold">Lịch sử</h3>
              <div className="space-y-2">
                {item.events?.map((ev: any) => (
                  <div key={ev.id} className="border-l-2 pl-3 text-sm">
                    <div className="font-medium">{ev.eventType}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(ev.createdAt).toLocaleString("vi-VN")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {showEdit && item && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitEdit} className="grid max-h-[90vh] w-full max-w-3xl grid-cols-2 gap-4 overflow-y-auto rounded-xl bg-background p-6 shadow-xl">
            <div className="col-span-2 flex items-center justify-between">
              <div><h2 className="text-xl font-semibold">Chỉnh sửa hợp đồng</h2><p className="font-mono text-sm text-muted-foreground">{item.contractNumber}</p></div>
              <button type="button" onClick={() => setShowEdit(false)}><X /></button>
            </div>
            <label className="text-sm">Số hợp đồng<Input name="contractNumber" defaultValue={item.contractNumber || ""} required /></label>
            <label className="text-sm">Tên hợp đồng<Input name="title" defaultValue={item.title || ""} required /></label>
            <label className="text-sm">Tên đối tác<Input name="counterpartyName" defaultValue={item.counterpartyName || ""} required /></label>
            <label className="text-sm">Mã số thuế<Input name="counterpartyTax" defaultValue={item.counterpartyTax || ""} /></label>
            <label className="text-sm">Email<Input name="counterpartyEmail" type="email" defaultValue={item.counterpartyEmail || ""} /></label>
            <label className="text-sm">Điện thoại<Input name="counterpartyPhone" defaultValue={item.counterpartyPhone || ""} /></label>
            <label className="col-span-2 text-sm">Địa chỉ<Input name="counterpartyAddress" defaultValue={item.billingParty?.address || ""} /></label>
            <label className="text-sm">Loại hợp đồng<select name="type" defaultValue={item.type} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{TYPES.map(type => <option key={type} value={type}>{t(serviceContractTypeTranslationKey(type))}</option>)}</select></label>
            <label className="text-sm">Chiều thanh toán<select name="paymentDirection" defaultValue={item.paymentDirection} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="PAYABLE">Phải trả</option><option value="RECEIVABLE">Phải thu</option></select></label>
            <label className="text-sm">Nhóm sản phẩm/dịch vụ<select name="serviceCategory" defaultValue={item.serviceCategory || "OTHER"} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{SERVICE_CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">Mô tả chi tiết<Input name="productName" defaultValue={item.productName || ""} /></label>
            <label className="text-sm">Giá trị hợp đồng<Input name="totalValue" type="number" min="0" defaultValue={item.totalValue ?? 0} /></label>
            <label className="text-sm">Cơ sở giá trị<select name="valueBasis" defaultValue={item.valueBasis || "ONE_TIME"} className="mt-1 h-10 w-full rounded-md border bg-background px-3">{VALUE_BASES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm">Ngày ký<Input name="signedDate" type="date" defaultValue={item.signedDate?.slice(0, 10) || ""} /></label>
            <label className="text-sm">Ngày bắt đầu<Input name="startDate" type="date" defaultValue={item.startDate?.slice(0, 10) || ""} /></label>
            <label className="text-sm">Ngày kết thúc<Input name="endDate" type="date" defaultValue={item.endDate?.slice(0, 10) || ""} /></label>
            <label className="text-sm">Tiền tệ<select name="currency" defaultValue={item.currency || "VND"} className="mt-1 h-10 w-full rounded-md border bg-background px-3"><option value="VND">VND</option><option value="USD">USD</option><option value="MMK">MMK</option></select></label>
            {item.paymentDirection === "RECEIVABLE" && <>
              <label className="text-sm">Xuất hóa đơn trước (ngày)<Input name="invoiceLeadDays" type="number" min="0" defaultValue={item.invoiceLeadDays ?? 7} /></label>
              <label className="text-sm">VAT mặc định (%)<Input name="defaultVatRate" type="number" min="0" defaultValue={item.defaultVatRate ?? 10} /></label>
              <label className="text-sm">Hạn thanh toán (ngày)<Input name="paymentTermDays" type="number" min="0" defaultValue={item.paymentTermDays ?? 15} /></label>
            </>}
            <label className="col-span-2 text-sm">Ghi chú<textarea name="notes" defaultValue={item.notes || ""} className="mt-1 min-h-24 w-full rounded-md border bg-background p-3" /></label>
            <input type="hidden" name="mallId" value={item.mallId} />
            <div className="col-span-2 flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setShowEdit(false)}>Hủy</Button><Button disabled={update.isPending}>{update.isPending ? "Đang lưu..." : "Lưu thay đổi"}</Button></div>
          </form>
        </div>
      )}
      {showRenew && item && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <form onSubmit={submitRenew} className="grid w-full max-w-xl grid-cols-2 gap-4 rounded-xl bg-background p-6 shadow-xl">
            <div className="col-span-2 flex items-center justify-between">
              <div><h2 className="text-xl font-semibold">Gia hạn hợp đồng</h2><p className="font-mono text-sm text-muted-foreground">Từ {item.contractNumber}</p></div>
              <button type="button" onClick={() => setShowRenew(false)}><X /></button>
            </div>
            <label className="col-span-2 text-sm">Số hợp đồng pháp lý mới *<Input name="contractNumber" required placeholder="Nhập đúng số trên hợp đồng gia hạn" /></label>
            <label className="col-span-2 text-sm">Tên hợp đồng<Input name="title" defaultValue={item.title} /></label>
            <label className="text-sm">Ngày bắt đầu<Input name="startDate" type="date" defaultValue={item.endDate?.slice(0, 10) || ""} /></label>
            <label className="text-sm">Ngày kết thúc mới *<Input name="endDate" type="date" required /></label>
            <label className="col-span-2 text-sm">Giá trị hợp đồng<Input name="totalValue" type="number" min="0" defaultValue={item.totalValue ?? 0} /></label>
            <label className="col-span-2 text-sm">Ghi chú<textarea name="notes" className="mt-1 min-h-20 w-full rounded-md border bg-background p-3" /></label>
            <div className="col-span-2 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setShowRenew(false)}>Hủy</Button>
              <Button disabled={renew.isPending}>{renew.isPending ? "Đang gia hạn..." : "Tạo hợp đồng gia hạn"}</Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ContractLifecycle({
  status,
  canEdit,
  pendingStatus,
  isPending,
  onSelect,
  onCancel,
  onConfirm,
}: {
  status: string;
  canEdit: boolean;
  pendingStatus: string | null;
  isPending: boolean;
  onSelect: (status: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const transitions = ALLOWED_TRANSITIONS[status] || [];
  const currentIndex = LIFECYCLE_FLOW.indexOf(status);
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div>
        <h3 className="font-semibold">Vòng đời hợp đồng</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          Theo dõi tiến trình và chọn bước chuyển tiếp phù hợp. Mọi thay đổi đều được lưu vào lịch sử hợp đồng.
        </p>
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-max items-center gap-1">
          {LIFECYCLE_FLOW.map((stage, index) => (
            <div key={stage} className="flex items-center gap-1">
              <div className={`rounded-full border px-3 py-1.5 text-xs ${stage === status ? "border-primary bg-primary text-primary-foreground font-semibold" : currentIndex >= 0 && index < currentIndex ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "bg-muted/30 text-muted-foreground"}`}>
                {labels[stage]}
              </div>
              {index < LIFECYCLE_FLOW.length - 1 && <span className="text-muted-foreground">→</span>}
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-md border-l-4 border-primary bg-muted/40 p-3">
        <div className="text-xs font-medium uppercase text-muted-foreground">Trạng thái hiện tại</div>
        <div className="mt-1 font-semibold">{labels[status] || status}</div>
        <p className="mt-1 text-sm text-muted-foreground">{STATUS_DESCRIPTIONS[status] || "Chưa có mô tả cho trạng thái này."}</p>
      </div>
      {canEdit && transitions.length > 0 && (
        <div>
          <div className="mb-2 text-sm font-medium">Bước có thể chuyển tiếp</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {transitions.map(next => (
              <button
                key={next}
                type="button"
                className={`rounded-md border p-3 text-left transition hover:border-primary hover:bg-muted/40 ${pendingStatus === next ? "border-primary ring-2 ring-primary/20" : ""}`}
                onClick={() => onSelect(next)}
              >
                <div className={`font-medium ${["CANCELLED", "TERMINATED"].includes(next) ? "text-red-600" : ""}`}>
                  Chuyển sang “{labels[next]}”
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{STATUS_DESCRIPTIONS[next]}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      {canEdit && transitions.length === 0 && (
        <div className="rounded-md bg-muted p-3 text-sm text-muted-foreground">
          Đây là trạng thái kết thúc. Không có bước chuyển tiếp trực tiếp từ trạng thái này.
        </div>
      )}
      {pendingStatus && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <div className="font-medium">Xác nhận chuyển sang “{labels[pendingStatus]}”?</div>
          <p className="mt-1 text-xs">{STATUS_DESCRIPTIONS[pendingStatus]}</p>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancel} disabled={isPending}>Hủy</Button>
            <Button size="sm" variant={["CANCELLED", "TERMINATED"].includes(pendingStatus) ? "destructive" : "default"} onClick={onConfirm} disabled={isPending}>
              {isPending ? "Đang cập nhật..." : "Xác nhận chuyển trạng thái"}
            </Button>
          </div>
        </div>
      )}
      {!canEdit && <p className="text-xs text-muted-foreground">Bạn có quyền xem vòng đời nhưng không có quyền chuyển trạng thái hợp đồng.</p>}
    </section>
  );
}

function ContractOperations({
  item,
  onChanged,
  canEdit,
  canTransferToBilling,
}: {
  item: any;
  onChanged: () => void;
  canEdit: boolean;
  canTransferToBilling: boolean;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState("payments");
  const [payment, setPayment] = useState({
    milestone: "",
    dueDate: "",
    amount: "",
  });
  const [recurring, setRecurring] = useState({
    amount: "",
    startDate: "",
    count: "12",
    frequency: "MONTHLY",
    reminderDays: "7",
    milestonePrefix: "Kỳ thanh toán",
  });
  const [task, setTask] = useState("");
  const [milestone, setMilestone] = useState("");
  const run = async (action: Promise<any>, message: string) => {
    try {
      await action;
      onChanged();
      toast({ title: message });
    } catch (e: any) {
      toast({
        title: "Không thể thực hiện",
        description: e?.response?.data?.message,
        variant: "destructive",
      });
    }
  };
  const tabs = [
    ["payments", `Thanh toán (${item.payments?.length || 0})`],
    ["checklist", `Checklist (${item.checklist?.length || 0})`],
    ["milestones", `Mốc thực hiện (${item.milestones?.length || 0})`],
  ];
  return (
    <div className="mt-6">
      <div className="flex gap-1 border-b">
        {tabs.map(([key, title]) => (
          <button
            key={key}
            className={`px-3 py-2 text-sm ${tab === key ? "border-b-2 border-primary font-medium" : "text-muted-foreground"}`}
            onClick={() => setTab(key)}
          >
            {title}
          </button>
        ))}
      </div>
      {tab === "payments" && (
        <div className="space-y-4 pt-3">
          <div
            className={`rounded p-3 text-sm ${item.paymentDirection === "RECEIVABLE" ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}
          >
            {item.paymentDirection === "RECEIVABLE"
              ? "Hợp đồng phải thu — hệ thống sẽ nhắc người phụ trách chuẩn bị thu."
              : "Hợp đồng phải trả — hệ thống sẽ nhắc người phụ trách chuẩn bị thanh toán."}
          </div>
          {canEdit && <><div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Đợt thanh toán"
              value={payment.milestone}
              onChange={(e) =>
                setPayment({ ...payment, milestone: e.target.value })
              }
            />
            <Input
              type="date"
              value={payment.dueDate}
              onChange={(e) =>
                setPayment({ ...payment, dueDate: e.target.value })
              }
            />
            <Input
              type="number"
              placeholder="Số tiền"
              value={payment.amount}
              onChange={(e) =>
                setPayment({ ...payment, amount: e.target.value })
              }
            />
          </div>
          <Button
            size="sm"
            disabled={!payment.milestone || !payment.dueDate || !payment.amount}
            onClick={() =>
              run(
                serviceContractsApi.createPayment(item.id, {
                  ...payment,
                  reminderDays: 7,
                }),
                "Đã thêm lịch thanh toán",
              )
            }
          >
            Thêm một đợt
          </Button>
          <details className="rounded border p-3">
            <summary className="cursor-pointer font-medium">
              Tạo thanh toán theo kỳ
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Input
                type="number"
                placeholder="Số tiền mỗi kỳ"
                value={recurring.amount}
                onChange={(e) =>
                  setRecurring({ ...recurring, amount: e.target.value })
                }
              />
              <Input
                type="date"
                value={recurring.startDate}
                onChange={(e) =>
                  setRecurring({ ...recurring, startDate: e.target.value })
                }
              />
              <Input
                type="number"
                min="1"
                placeholder="Số kỳ"
                value={recurring.count}
                onChange={(e) =>
                  setRecurring({ ...recurring, count: e.target.value })
                }
              />
              <select
                className="rounded-md border bg-background px-2"
                value={recurring.frequency}
                onChange={(e) =>
                  setRecurring({ ...recurring, frequency: e.target.value })
                }
              >
                <option value="MONTHLY">Hàng tháng</option>
                <option value="QUARTERLY">Hàng quý</option>
                <option value="ANNUALLY">Hàng năm</option>
              </select>
              <Input
                type="number"
                min="0"
                placeholder="Nhắc trước (ngày)"
                value={recurring.reminderDays}
                onChange={(e) =>
                  setRecurring({ ...recurring, reminderDays: e.target.value })
                }
              />
              <Input
                placeholder="Tên kỳ"
                value={recurring.milestonePrefix}
                onChange={(e) =>
                  setRecurring({
                    ...recurring,
                    milestonePrefix: e.target.value,
                  })
                }
              />
            </div>
            <Button
              className="mt-3"
              size="sm"
              disabled={
                !recurring.amount || !recurring.startDate || !recurring.count
              }
              onClick={() =>
                run(
                  serviceContractsApi.recurringPayments(item.id, recurring),
                  "Đã tạo lịch thanh toán theo kỳ",
                )
              }
            >
              Tạo các kỳ
            </Button>
          </details>
          </>}
          {item.payments?.map((p: any) => (
            <div key={p.id} className="rounded border p-3 text-sm">
              <div className="flex items-center justify-between">
                <div>
                  <b>{p.milestone}</b>
                  <div className="text-muted-foreground">
                    {new Date(p.dueDate).toLocaleDateString("vi-VN")} ·{" "}
                    {formatMoneyAmount(Number(p.amount), p.currency as CurrencyCode)} {p.currency} ·
                    nhắc trước {p.reminderDays} ngày
                  </div>
                  {p.paidDate && (
                    <div className="text-emerald-600">
                      Đã thanh toán{" "}
                      {formatMoneyAmount(Number(p.paidAmount || p.amount), p.currency as CurrencyCode)}{" "}
                      {p.currency}{" "}
                      · {new Date(p.paidDate).toLocaleDateString("vi-VN")}
                    </div>
                  )}
                </div>
                {canEdit && <Button
                  size="sm"
                  variant="outline"
                  disabled={p.status === "PAID" || Boolean(p.invoiceId)}
                  onClick={() =>
                    run(
                      serviceContractsApi.updatePayment(item.id, p.id, {
                        status: "PAID",
                        paidAmount: p.amount,
                      }),
                      item.paymentDirection === "RECEIVABLE"
                        ? "Đã ghi nhận thu tiền"
                        : "Đã ghi nhận thanh toán",
                    )
                  }
                >
                  {p.status === "PAID"
                    ? "Đã hoàn tất"
                    : item.paymentDirection === "RECEIVABLE"
                      ? "Ghi nhận đã thu"
                      : "Ghi nhận đã trả"}
                </Button>}
              </div>
              {item.paymentDirection === "RECEIVABLE" && (
                <div className="mt-2 flex items-center gap-2">
                  {p.invoiceId ? (
                    <span className="rounded bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      {p.invoiceNumber} · {p.billingStatus || "INVOICE_DRAFT"}
                    </span>
                  ) : canTransferToBilling ? (
                    <Button size="sm" onClick={() => run(serviceContractsApi.transferToBilling(item.id, p.id), "Đã chuyển kỳ thu sang Billing")}>Chuyển kế toán</Button>
                  ) : null}
                </div>
              )}
              <div className="mt-2 flex gap-2">
                {canEdit && <label className="cursor-pointer rounded border px-2 py-1 text-xs">
                  <Upload className="mr-1 inline" size={12} />
                  Lưu hóa đơn
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        run(
                          serviceContractsApi.upload(
                            item.id,
                            f,
                            "INVOICE",
                            p.id,
                          ),
                          "Đã lưu hóa đơn",
                        );
                    }}
                  />
                </label>}
                {canEdit && <label className="cursor-pointer rounded border px-2 py-1 text-xs">
                  <Upload className="mr-1 inline" size={12} />
                  Chứng từ thanh toán
                  <input
                    type="file"
                    className="hidden"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f)
                        run(
                          serviceContractsApi.upload(
                            item.id,
                            f,
                            "PAYMENT_PROOF",
                            p.id,
                          ),
                          "Đã lưu chứng từ",
                        );
                    }}
                  />
                </label>}
                {p.documents?.map((d: any) => (
                  <button
                    type="button"
                    className="px-2 py-1 text-xs text-primary underline"
                    key={d.id}
                    onClick={() => openAuthenticatedFile(`/files/service-contract-documents/${d.id}`)}
                  >
                    {d.documentType}: {d.fileName}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {tab === "checklist" && (
        <div className="space-y-3 pt-3">
          {canEdit && <div className="flex gap-2">
            <Input
              placeholder="Nội dung checklist"
              value={task}
              onChange={(e) => setTask(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!task}
              onClick={() =>
                run(
                  serviceContractsApi.createChecklist(item.id, { title: task }),
                  "Đã thêm checklist",
                )
              }
            >
              Thêm
            </Button>
          </div>}
          {item.checklist?.map((c: any) => (
            <label
              key={c.id}
              className="flex items-center gap-3 rounded border p-3 text-sm"
            >
              <input
                type="checkbox"
                checked={c.isCompleted}
                disabled={!canEdit}
                onChange={(e) =>
                  run(
                    serviceContractsApi.updateChecklist(item.id, c.id, {
                      isCompleted: e.target.checked,
                    }),
                    "Đã cập nhật checklist",
                  )
                }
              />
              <span
                className={
                  c.isCompleted ? "line-through text-muted-foreground" : ""
                }
              >
                {c.title}
              </span>
            </label>
          ))}
        </div>
      )}
      {tab === "milestones" && (
        <div className="space-y-3 pt-3">
          {canEdit && <div className="flex gap-2">
            <Input
              placeholder="Tên mốc thực hiện"
              value={milestone}
              onChange={(e) => setMilestone(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!milestone}
              onClick={() =>
                run(
                  serviceContractsApi.createMilestone(item.id, {
                    title: milestone,
                  }),
                  "Đã thêm mốc thực hiện",
                )
              }
            >
              Thêm
            </Button>
          </div>}
          {item.milestones?.map((m: any) => (
            <div
              key={m.id}
              className="flex items-center justify-between rounded border p-3 text-sm"
            >
              <span
                className={
                  m.status === "DONE"
                    ? "line-through text-muted-foreground"
                    : ""
                }
              >
                {m.title}
              </span>
              {canEdit && <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  run(
                    serviceContractsApi.updateMilestone(item.id, m.id, {
                      status: m.status === "DONE" ? "PENDING" : "DONE",
                    }),
                    "Đã cập nhật mốc",
                  )
                }
              >
                {m.status === "DONE" ? "Mở lại" : "Hoàn thành"}
              </Button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
