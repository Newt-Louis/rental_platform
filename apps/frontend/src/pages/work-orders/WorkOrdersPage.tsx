import { useState } from "react";
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
import { spacesApi, usersApi, workOrdersApi } from "@/api";
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
import WorkOrderTemplates from "./WorkOrderTemplates";

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
  const qc = useQueryClient(),
    { toast } = useToast(),
    selectedMallId = useMallStore((s) => s.selectedMallId);
  const [mallId, setMallId] = useState(selectedMallId || ""),
    [search, setSearch] = useState(""),
    [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [form, setForm] = useState<any>({ ...empty, mallId: selectedMallId || "" }),
    [comment, setComment] = useState(""),
    [newChecklist, setNewChecklist] = useState("");
  const mallsQ = useQuery({
    queryKey: ["malls"],
    queryFn: spacesApi.listMalls,
  });
  const usersQ = useQuery({
    queryKey: ["work-order-users"],
    queryFn: () => usersApi.listUsers({ limit: 200 }),
  });
  const listQ = useQuery({
    queryKey: ["work-orders", mallId, status, search],
    queryFn: () =>
      workOrdersApi.list({
        ...(mallId && { mallId }),
        ...(status && { status }),
        ...(search && { search }),
        limit: 100,
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
  const malls: any[] = Array.isArray(mallsQ.data)
    ? mallsQ.data
    : (mallsQ.data as any)?.data || [];
  const users: any[] = ((usersQ.data as any)?.data || usersQ.data || []).filter(
    (u: any) => u.role !== "TENANT",
  );
  const rows: any[] = (listQ.data as any)?.data || [];
  const summary: any = summaryQ.data || {};
  const item: any = detailQ.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["work-order-summary"] });
    qc.invalidateQueries({ queryKey: ["work-order-detail"] });
  };
  const action = useMutation({
    mutationFn: async ({ kind, data }: any) =>
      kind === "create"
        ? workOrdersApi.create(data)
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
    onSuccess: () => {
      refresh();
      setCreateOpen(false);
      setComment("");
      setNewChecklist("");
      toast({ title: "Đã cập nhật công việc" });
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
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ClipboardCheck />
            Điều phối công việc
          </h1>
          <p className="text-sm text-muted-foreground">
            Work Order liên phòng ban · checklist · minh chứng · SLA · nghiệm
            thu
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="mr-2 h-4 w-4" />
            Xuất báo cáo
          </Button>
          <Button
            onClick={() => {
              setForm({ ...empty, mallId: mallId || selectedMallId || "" });
              setCreateOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Tạo công việc
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tổng công việc", summary.total || 0, ClipboardCheck],
          [
            "Đang xử lý",
            (summary.byStatus?.IN_PROGRESS || 0) +
              (summary.byStatus?.ASSIGNED || 0),
            Clock,
          ],
          ["Chờ nghiệm thu", summary.pendingReview || 0, CheckCircle2],
          ["Quá hạn", summary.overdue || 0, AlertTriangle],
        ].map(([l, v, I]: any) => (
          <div className="rounded-lg border bg-card p-4" key={l}>
            <div className="flex justify-between text-sm text-muted-foreground">
              {l}
              <I className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-bold">{v}</div>
          </div>
        ))}
      </div>
      <WorkOrderTemplates mallId={mallId} malls={malls} users={users} />
      <div className="flex flex-wrap gap-3 rounded-lg border p-4">
        <select
          className="h-10 min-w-64 rounded-md border px-3"
          value={mallId}
          onChange={(e) => setMallId(e.target.value)}
        >
          <option value="">Tất cả Mall</option>
          {malls.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border px-3"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tất cả trạng thái</option>
          {Object.entries(STATUS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm số phiếu, tiêu đề, vị trí..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr>
              {[
                "Số phiếu",
                "Công việc",
                "Nhóm",
                "Bộ phận",
                "Ưu tiên",
                "Người xử lý",
                "Hạn hoàn thành",
                "Trạng thái",
                "Checklist/Ảnh",
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
                  {CATEGORIES[w.category] || w.category}
                </td>
                <td className="px-4 py-3">{w.assignedDepartment || "—"}</td>
                <td className="px-4 py-3">
                  <Badge
                    variant={
                      w.priority === "CRITICAL" ? "destructive" : "outline"
                    }
                  >
                    {w.priority}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  {w.assignee?.fullName || "Chưa giao"}
                </td>
                <td
                  className={`px-4 py-3 ${w.dueDate && new Date(w.dueDate) < new Date() && !["COMPLETED", "CANCELLED"].includes(w.status) ? "font-semibold text-red-600" : ""}`}
                >
                  {w.dueDate
                    ? new Date(w.dueDate).toLocaleString("vi-VN")
                    : "—"}
                </td>
                <td className="px-4 py-3">
                  <Badge>{STATUS[w.status] || w.status}</Badge>
                </td>
                <td className="px-4 py-3">
                  {w._count?.checklist || 0} / {w._count?.evidence || 0}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td
                  colSpan={9}
                  className="p-10 text-center text-muted-foreground"
                >
                  Chưa có công việc vận hành
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo Work Order</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <F label="Trung tâm thương mại">
              <select
                required
                className="h-10 rounded-md border px-3"
                value={form.mallId}
                onChange={(e) => setForm({ ...form, mallId: e.target.value })}
              >
                <option value="">Chọn Mall</option>
                {malls.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
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
              <Input
                placeholder="Kỹ thuật, Vệ sinh..."
                value={form.assignedDepartment}
                onChange={(e) =>
                  setForm({ ...form, assignedDepartment: e.target.value })
                }
              />
            </F>
            <F label="Người xử lý">
              <select
                className="h-10 rounded-md border px-3"
                value={form.assigneeId}
                onChange={(e) =>
                  setForm({ ...form, assigneeId: e.target.value })
                }
              >
                <option value="">Chưa phân công</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.fullName}
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
            <DialogTitle>{item?.title || "Đang tải..."}</DialogTitle>
          </DialogHeader>
          {item && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                <Badge>{item.workOrderNumber}</Badge>
                <Badge variant="outline">{STATUS[item.status]}</Badge>
                <Badge variant="outline">
                  {CATEGORIES[item.category] || item.category}
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
                  <b>Bộ phận:</b> {item.assignedDepartment || "—"}
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
                    <a
                      key={e.id}
                      href={`/uploads/${e.filePath}`}
                      target="_blank"
                      className="overflow-hidden rounded-lg border"
                    >
                      <img
                        className="h-24 w-full object-cover"
                        src={`/uploads/${e.filePath}`}
                      />
                      <div className="p-1 text-center text-xs">
                        {e.evidenceType}
                      </div>
                    </a>
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
                      <b>{event.eventType}</b> · {event.user?.fullName}
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
                    {STATUS[s]}
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
