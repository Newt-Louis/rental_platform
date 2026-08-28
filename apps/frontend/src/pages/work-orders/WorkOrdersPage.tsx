import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Plus,
  Search,
  Upload,
  Download,
  MessageSquare,
  History,
} from "lucide-react";
import { usersApi, workOrdersApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import WorkOrderTemplates from "./WorkOrderTemplates";
import { PageHeader } from "@/components/ui/page-header";
import { ERPToolbar } from "@/components/erp";

const CATEGORIES: Record<string, string> = {
  TECHNICAL: "Kỹ thuật",
  CLEANING: "Vệ sinh",
  SECURITY: "An ninh",
  LANDSCAPE: "Cảnh quan",
  FACILITY: "Cơ sở vật chất",
  OTHER: "Khác",
};
const STATUS: Record<string, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã giao",
  IN_PROGRESS: "Đang xử lý",
  ON_HOLD: "Tạm dừng",
  WAITING_REVIEW: "Chờ nghiệm thu",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
};
const NEXT: Record<string, string[]> = {
  NEW: ["IN_PROGRESS", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING_REVIEW", "ON_HOLD", "CANCELLED"],
  ON_HOLD: ["IN_PROGRESS", "CANCELLED"],
};
const empty = {
  mallId: "",
  category: "TECHNICAL",
  title: "",
  description: "",
  priority: "MEDIUM",
  location: "",
  assignedDepartment: "",
  assigneeId: "",
  dueDate: "",
  checklistText: "",
};
const err = (e: any) =>
  e?.response?.data?.message || e?.message || "Có lỗi xảy ra";

export default function WorkOrdersPage() {
  const { t } = useTranslation("workOrders");
  const qc = useQueryClient(),
    { toast } = useToast(),
    selectedMallId = useMallStore((s) => s.selectedMallId),
    selectedMallName = useMallStore((s) => s.selectedMallName),
    openMallContextModal = useMallStore((s) => s.openMallContextModal);
  const mallId = selectedMallId || "";
  const [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState("");
  const [department, setDepartment] = useState("");
  const [alert, setAlert] = useState("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false),
    [form, setForm] = useState<any>({ ...empty, mallId: selectedMallId || "" }),
    [createImages, setCreateImages] = useState<File[]>([]),
    [comment, setComment] = useState(""),
    [newChecklist, setNewChecklist] = useState("");

  // The selected work order lives in the URL (not local state) so a notification's
  // /work-orders?id=... link opens the exact record, the URL stays shareable/bookmarkable,
  // a refresh preserves it, and browser Back/Forward restores it for free. Closing removes
  // only `id`, leaving search/status/category/priority/department/alert/page untouched.
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("id");
  const setSelectedId = (id: string | null) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set("id", id);
      else next.delete("id");
      return next;
    });
  };

  // Skip on the very first render: this effect exists to reset selection when the operator
  // switches malls, not to wipe out a ?id= a notification link (or a bookmark/refresh) put in
  // the URL before this component ever mounted.
  const isInitialMallMount = useRef(true);
  useEffect(() => {
    if (isInitialMallMount.current) {
      isInitialMallMount.current = false;
      return;
    }
    setPage(1);
    setSelectedId(null);
    setCreateOpen(false);
    setForm({ ...empty, mallId });
    setCreateImages([]);
  }, [mallId]);
  const usersQ = useQuery({
    queryKey: ["work-order-users"],
    queryFn: () => usersApi.listUsers({ limit: 200 }),
  });
  const listQ = useQuery({
    queryKey: ["work-orders", mallId, status, category, priority, department, alert, search, page],
    queryFn: () =>
      workOrdersApi.list({
        ...(mallId && { mallId }),
        ...(status && { status }),
        ...(!status && !alert && { scope: "ACTIVE" }),
        ...(category && { category }),
        ...(priority && { priority }),
        ...(department && { department }),
        ...(alert && { alert }),
        ...(search && { search }),
        page,
        limit: 25,
      }),
  });
  const summaryQ = useQuery({
    queryKey: ["work-order-summary", mallId],
    queryFn: () => workOrdersApi.summary(mallId || undefined),
  });
  const detailQ = useQuery({
    queryKey: ["work-order-detail", selectedId],
    queryFn: () => workOrdersApi.detail(selectedId!),
    enabled: !!selectedId,
  });
  const users: any[] = ((usersQ.data as any)?.data || usersQ.data || []).filter(
    (u: any) => u.role !== "TENANT",
  );
  const rows: any[] = (listQ.data as any)?.data || [];
  const total = (listQ.data as any)?.total || 0;
  const totalPages = (listQ.data as any)?.totalPages || 1;
  const summary: any = summaryQ.data || {};
  const item: any = detailQ.data;
  const departments = useMemo(() => Array.from(new Set([
    ...Object.values(CATEGORIES).filter(value => value !== "Khác"),
    ...users.map((user: any) => user.department).filter(Boolean),
    ...rows.map((row: any) => row.assignedDepartment).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, "vi")), [users, rows]);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["work-order-summary"] });
    qc.invalidateQueries({ queryKey: ["work-order-detail"] });
  };
  const action = useMutation({
    mutationFn: async ({ kind, data }: any) =>
      kind === "create"
        ? (async () => {
            const { images = [], ...payload } = data;
            const created = await workOrdersApi.create(payload);
            let failedUploads = 0;
            for (const image of images as File[]) {
              try {
                await workOrdersApi.uploadEvidence(created.id, image, "BEFORE");
              } catch {
                failedUploads += 1;
              }
            }
            return { created, failedUploads };
          })()
        : kind === "assign"
          ? workOrdersApi.update(selectedId!, { assigneeId: data.assigneeId })
          : kind === "addChecklist"
            ? workOrdersApi.addChecklist(selectedId!, { title: data.title })
            : kind === "comment"
              ? workOrdersApi.addComment(selectedId!, data.content)
              : kind === "status"
                ? workOrdersApi.status(selectedId!, data.status, data.note)
                : kind === "review"
                  ? workOrdersApi.review(selectedId!, data.approved, data.note)
                  : workOrdersApi.toggleChecklist(
                      selectedId!,
                      data.itemId,
                      data.completed,
                    ),
    onSuccess: (result: any) => {
      refresh();
      setCreateOpen(false);
      setCreateImages([]);
      setComment("");
      setNewChecklist("");
      if (result?.created?.id) setSelectedId(result.created.id);
      toast(result?.failedUploads ? {
        title: "Đã tạo công việc nhưng có ảnh chưa tải được",
        description: `${result.failedUploads} ảnh chưa được lưu. Vui lòng tải lại trong chi tiết Work Order.`,
        variant: "destructive",
      } : { title: "Đã cập nhật công việc" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật",
        description: err(e),
        variant: "destructive",
      }),
  });
  const upload = useMutation({
    mutationFn: ({ file, type }: { file: File; type: string }) =>
      workOrdersApi.uploadEvidence(selectedId!, file, type),
    onSuccess: () => {
      refresh();
      toast({ title: "Đã tải minh chứng" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể tải file",
        description: err(e),
        variant: "destructive",
      }),
  });
  const create = () => {
    if (!form.mallId || !form.title.trim())
      return toast({
        title: "Vui lòng chọn Mall và nhập tiêu đề",
        variant: "destructive",
      });
    action.mutate({
      kind: "create",
      data: {
        ...form,
        images: createImages,
        assigneeId: form.assigneeId || undefined,
        dueDate: form.dueDate || undefined,
        checklist: form.checklistText
          .split("\n")
          .map((x: string) => x.trim())
          .filter(Boolean),
        checklistText: undefined,
      },
    });
  };
  const exportCsv = async () => {
    try {
      const blob = await workOrdersApi.exportCsv({
        ...(mallId && { mallId }),
        ...(status && { status }),
        ...(!status && !alert && { scope: "ACTIVE" }),
        ...(category && { category }),
        ...(priority && { priority }),
        ...(department && { department }),
        ...(alert && { alert }),
        ...(search && { search }),
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `work-orders-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({
        title: "Không thể xuất báo cáo",
        description: err(e),
        variant: "destructive",
      });
    }
  };
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        eyebrow={t("page.eyebrow")}
        title={t("page.title")}
        description={t("page.subtitle")}
        actions={<>
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            {t("actions.export")}
          </Button>
          <Button
            onClick={() => {
              if (!mallId) {
                openMallContextModal();
                return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
              }
              setForm({ ...empty, mallId });
              setCreateImages([]);
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            {t("actions.create")}
          </Button>
        </>}
      />
      <div className="grid grid-cols-2 border-y bg-card lg:grid-cols-4">
        {[
          [t("summary.total"), summary.total || 0, ClipboardCheck],
          [
            t("summary.active"),
            (summary.byStatus?.IN_PROGRESS || 0) +
              (summary.byStatus?.ASSIGNED || 0),
            Clock,
          ],
          [t("summary.review"), summary.pendingReview || 0, CheckCircle2],
          [t("summary.overdue"), summary.overdue || 0, AlertTriangle],
        ].map(([l, v, I]: any) => (
          <div className="border-b px-4 py-3 even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0" key={l}>
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><I className="h-3.5 w-3.5" />{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 border-y bg-card lg:grid-cols-4">
        {[
          ["DUE_SOON", t("summary.dueSoon"), summary.dueSoon || 0],
          ["OVERDUE", t("summary.overdue"), summary.overdue || 0],
          ["UNASSIGNED", t("summary.unassigned"), summary.unassigned || 0],
          ["CRITICAL", t("summary.critical"), summary.critical || 0],
        ].map(([key, title, count]) => <button key={String(key)} className={`flex items-center justify-between border-b px-4 py-2.5 text-left hover:bg-muted/40 even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0 ${alert === key ? "bg-muted ring-1 ring-inset ring-primary" : ""}`} onClick={() => { setAlert(String(key)); setStatus(""); setPage(1); }}><span className="text-xs font-medium text-muted-foreground">{title}</span><span className="text-lg font-semibold tabular-nums">{String(count)}</span></button>)}
      </div>
      <WorkOrderTemplates mallId={mallId} mallName={selectedMallName} users={users} />
      <ERPToolbar>
        <select
          className="h-10 rounded-md border px-3"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setAlert(""); setPage(1); }}
        >
          <option value="">{t("filters.allStatuses")}</option>
          {Object.keys(STATUS).map((k) => (
            <option key={k} value={k}>
              {t(`status.${k}`)}
            </option>
          ))}
        </select>
        <select className="h-10 rounded-md border px-3" value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}><option value="">{t("filters.allCategories")}</option>{Object.keys(CATEGORIES).map((key) => <option key={key} value={key}>{t(`category.${key}`)}</option>)}</select>
        <select className="h-10 rounded-md border px-3" value={priority} onChange={(e) => { setPriority(e.target.value); setPage(1); }}><option value="">{t("filters.allPriorities")}</option>{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((key) => <option key={key} value={key}>{t(`priority.${key}`)}</option>)}</select>
        <select className="h-10 rounded-md border px-3" value={department} onChange={(e) => { setDepartment(e.target.value); setPage(1); }}><option value="">{t("filters.allDepartments")}</option>{departments.map((value) => <option key={value} value={value}>{value}</option>)}</select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder={t("filters.search")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
      </ERPToolbar>
      <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{t("table.showing", { shown: rows.length, total: total.toLocaleString() })}</span><div className="flex items-center gap-2"><span>{t("filters.activeDefault")}</span>{(status || category || priority || department || alert) && <Button size="sm" variant="outline" onClick={() => { setStatus(""); setCategory(""); setPriority(""); setDepartment(""); setAlert(""); setPage(1); }}>{t("actions.reset")}</Button>}</div></div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              {[
                t("table.number"), t("table.work"), t("table.category"), t("table.requesterDepartment"),
                t("table.assignedDepartment"), t("table.priority"), t("table.assignee"), t("table.due"),
                t("table.status"), t("table.evidence"),
              ].map((x) => (
                <th className="px-4 py-3 text-left" key={x}>
                  {x}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <tr
                key={w.id}
                className="cursor-pointer border-t hover:bg-muted/40"
                onClick={() => setSelectedId(w.id)}
              >
                <td className="px-4 py-3 font-mono text-xs">
                  {w.workOrderNumber}
                </td>
                <td className="px-4 py-3">
                  <b>{w.title}</b>
                  <div className="text-xs text-muted-foreground">
                    {w.location || w.unit?.code || "—"}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {t(`category.${w.category}`, { defaultValue: w.category })}
                </td>
                <td className="px-4 py-3">{w.requester?.department || "—"}</td>
                <td className="px-4 py-3">{w.assignedDepartment || "—"}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      w.priority === "CRITICAL" ? "destructive" : "outline"
                    }
                  >
                    {t(`priority.${w.priority}`, { defaultValue: t('common:unknownValue') })}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {w.assignee?.fullName || t("table.unassigned")}
                </td>
                <td
                  className={`px-4 py-3 ${w.dueDate && new Date(w.dueDate) < new Date() && !["COMPLETED", "CANCELLED"].includes(w.status) ? "font-semibold text-red-600" : ""}`}
                >
                  {w.dueDate
                    ? new Date(w.dueDate).toLocaleString("vi-VN")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge>{t(`status.${w.status}`, { defaultValue: t('common:unknownValue') })}</Badge>
                </td>
                <td className="px-4 py-3">
                  {w._count?.checklist || 0} / {w._count?.evidence || 0}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={10}
                  className="p-10 text-center text-muted-foreground"
                >
                  {t("table.empty")}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3 text-sm"><span>Trang {page} / {totalPages}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Trang trước</Button><Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(value => value + 1)}>Trang sau</Button></div></div>}
      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setCreateImages([]); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo Work Order</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <F label="Trung tâm thương mại">
              <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
                {selectedMallName}
              </div>
            </F>
            <F label="Nhóm công việc">
              <select
                className="h-10 rounded-md border px-3"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </F>
            <div className="col-span-2">
              <F label="Tiêu đề">
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </F>
            </div>
            <F label="Bộ phận xử lý">
              <select
                className="h-10 rounded-md border px-3"
                value={form.assignedDepartment}
                onChange={(e) =>
                  setForm({ ...form, assignedDepartment: e.target.value })
                }
              >
                <option value="">Chọn bộ phận xử lý</option>
                {departments.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </F>
            <F label="Người xử lý">
              <select
                className="h-10 rounded-md border px-3"
                value={form.assigneeId}
                onChange={(e) => {
                  const assignee = users.find((user: any) => user.id === e.target.value);
                  setForm({
                    ...form,
                    assigneeId: e.target.value,
                    assignedDepartment: assignee?.department || form.assignedDepartment,
                  });
                }}
              >
                <option value="">Chưa phân công</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}{u.department ? ` — ${u.department}` : ""}
                  </option>
                ))}
              </select>
            </F>
            <F label="Vị trí">
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </F>
            <F label="Hạn hoàn thành">
              <Input
                type="datetime-local"
                value={form.dueDate}
                onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
              />
            </F>
            <div className="col-span-2">
              <F label="Mô tả">
                <textarea
                  className="min-h-20 rounded-md border p-3"
                  value={form.description}
                  onChange={(e) =>
                    setForm({ ...form, description: e.target.value })
                  }
                />
              </F>
            </div>
            <div className="col-span-2">
              <F label="Hình ảnh yêu cầu">
                <Input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(event) => {
                    const files = Array.from(event.target.files || []);
                    const valid = files.filter(file => file.size <= 15 * 1024 * 1024);
                    if (valid.length !== files.length) toast({ title: "Một số ảnh vượt quá 15 MB", variant: "destructive" });
                    setCreateImages(valid);
                  }}
                />
                {createImages.length > 0 && <span className="text-xs font-normal text-muted-foreground">Đã chọn {createImages.length} ảnh. Ảnh sẽ được tải lên sau khi tạo Work Order.</span>}
              </F>
            </div>
            <div className="col-span-2">
              <F label="Checklist (mỗi dòng một mục)">
                <textarea
                  className="min-h-24 rounded-md border p-3"
                  value={form.checklistText}
                  onChange={(e) =>
                    setForm({ ...form, checklistText: e.target.value })
                  }
                />
              </F>
            </div>
            <div className="col-span-2">
              <Button
                className="w-full"
                onClick={create}
                disabled={action.isPending}
              >
                Lưu và giao việc
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {item?.title || (detailQ.isError ? "Không tìm thấy công việc" : "Đang tải...")}
            </DialogTitle>
          </DialogHeader>
          {detailQ.isError && (
            <p className="text-sm text-muted-foreground">
              Công việc này không tồn tại hoặc đã bị xóa.
            </p>
          )}
          {item && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{item.workOrderNumber}</Badge>
                <Badge variant="outline">{t(`status.${item.status}`, { defaultValue: t('common:unknownValue') })}</Badge>
                <Badge variant="outline">
                  {t(`category.${item.category}`, { defaultValue: item.category })}
                </Badge>
              </div>
              <p className="rounded-lg bg-muted p-3 text-sm">
                {item.description || "Không có mô tả"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <div>
                  <b>Vị trí:</b> {item.location || "—"}
                </div>
                <div>
                  <b>Người gửi:</b> {item.requester?.fullName || "—"}
                </div>
                <div>
                  <b>Bộ phận gửi:</b> {item.requester?.department || "—"}
                </div>
                <div>
                  <b>Bộ phận xử lý:</b> {item.assignedDepartment || "—"}
                </div>
                <div>
                  <b>Người xử lý:</b> {item.assignee?.fullName || "Chưa giao"}
                </div>
                <div>
                  <b>Hạn:</b>{" "}
                  {item.dueDate
                    ? new Date(item.dueDate).toLocaleString("vi-VN")
                    : "—"}
                </div>
              </div>
              <section className="rounded-lg border p-3">
                <label className="mb-1 block text-sm font-semibold">
                  Phân công người xử lý
                </label>
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={item.assigneeId || ""}
                  onChange={(e) =>
                    action.mutate({
                      kind: "assign",
                      data: { assigneeId: e.target.value },
                    })
                  }
                >
                  <option value="">Chưa phân công</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName}
                    </option>
                  ))}
                </select>
              </section>
              <section>
                <h3 className="mb-2 font-semibold">Checklist</h3>
                <div className="space-y-2">
                  {item.checklist.map((c: any) => (
                    <label
                      className="flex gap-3 rounded-lg border p-3"
                      key={c.id}
                    >
                      <input
                        type="checkbox"
                        checked={c.isCompleted}
                        onChange={(e) =>
                          action.mutate({
                            kind: "checklist",
                            data: { itemId: c.id, completed: e.target.checked },
                          })
                        }
                      />
                      <span
                        className={
                          c.isCompleted
                            ? "line-through text-muted-foreground"
                            : ""
                        }
                      >
                        {c.title}
                      </span>
                      {c.isRequired && (
                        <Badge variant="outline" className="ml-auto">
                          Bắt buộc
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Thêm mục checklist"
                    value={newChecklist}
                    onChange={(e) => setNewChecklist(e.target.value)}
                  />
                  <Button
                    variant="outline"
                    disabled={!newChecklist.trim()}
                    onClick={() =>
                      action.mutate({
                        kind: "addChecklist",
                        data: { title: newChecklist.trim() },
                      })
                    }
                  >
                    Thêm
                  </Button>
                </div>
              </section>
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-semibold">
                    Minh chứng ({item.evidence.length})
                  </h3>
                  <div className="flex gap-2">
                    <EvidenceButton
                      type="BEFORE"
                      label="Ảnh trước"
                      onFile={(f: File) =>
                        upload.mutate({ file: f, type: "BEFORE" })
                      }
                    />
                    <EvidenceButton
                      type="AFTER"
                      label="Ảnh sau"
                      onFile={(f: File) =>
                        upload.mutate({ file: f, type: "AFTER" })
                      }
                    />
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {item.evidence.map((e: any) => (
                    <div key={e.id} className="overflow-hidden rounded-lg border">
                      <AuthenticatedImage
                        className="h-24 w-full object-cover"
                        src={`/files/work-order-evidence/${e.id}`}
                        alt={e.evidenceType}
                      />
                      <div className="p-1 text-center text-xs">
                        {t(`evidence.${e.evidenceType}`, { defaultValue: e.evidenceType })}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <MessageSquare className="h-4 w-4" />
                  Trao đổi nội bộ ({item.comments?.length || 0})
                </h3>
                <div className="max-h-44 space-y-2 overflow-y-auto">
                  {item.comments?.map((c: any) => (
                    <div key={c.id} className="rounded-lg bg-muted p-3 text-sm">
                      <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                        <b>{c.user?.fullName}</b>
                        <span>
                          {new Date(c.createdAt).toLocaleString("vi-VN")}
                        </span>
                      </div>
                      {c.content}
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <Input
                    placeholder="Nhập nội dung trao đổi..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                  <Button
                    disabled={!comment.trim()}
                    onClick={() =>
                      action.mutate({
                        kind: "comment",
                        data: { content: comment.trim() },
                      })
                    }
                  >
                    Gửi
                  </Button>
                </div>
              </section>
              <section>
                <h3 className="mb-2 flex items-center gap-2 font-semibold">
                  <History className="h-4 w-4" />
                  Lịch sử xử lý
                </h3>
                <div className="max-h-40 space-y-2 overflow-y-auto border-l-2 pl-3">
                  {item.events?.map((event: any) => (
                    <div key={event.id} className="text-sm">
                      <b>{t(`event.${event.eventType}`, { defaultValue: event.eventType })}</b> · {event.user?.fullName}
                      <div className="text-xs text-muted-foreground">
                        {new Date(event.createdAt).toLocaleString("vi-VN")}
                        {event.description ? ` · ${event.description}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
              <div className="flex flex-wrap gap-2">
                {(NEXT[item.status] || []).map((s) => (
                  <Button
                    key={s}
                    variant={s === "CANCELLED" ? "destructive" : "default"}
                    onClick={() =>
                      action.mutate({ kind: "status", data: { status: s } })
                    }
                  >
                    {t(`status.${s}`, { defaultValue: s })}
                  </Button>
                ))}
                {item.status === "WAITING_REVIEW" && (
                  <>
                    <Button
                      onClick={() =>
                        action.mutate({
                          kind: "review",
                          data: { approved: true },
                        })
                      }
                    >
                      Nghiệm thu đạt
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={() =>
                        action.mutate({
                          kind: "review",
                          data: {
                            approved: false,
                            note: "Yêu cầu khắc phục lại",
                          },
                        })
                      }
                    >
                      Yêu cầu làm lại
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
function F({ label, children }: any) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function EvidenceButton({ label, onFile }: any) {
  return (
    <label className="cursor-pointer">
      <span className="inline-flex h-9 items-center rounded-md border px-3 text-sm">
        <Upload className="mr-2 h-4 w-4" />
        {label}
      </span>
      <input
        className="hidden"
        type="file"
        accept="image/*,.pdf"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </label>
  );
}
