import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pause, Play, Plus } from "lucide-react";
import { workOrdersApi } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

const FREQ: Record<string, string> = {
  DAILY: "Hàng ngày",
  WEEKLY: "Hàng tuần",
  MONTHLY: "Hàng tháng",
  QUARTERLY: "Hàng quý",
  ANNUALLY: "Hàng năm",
};
const CAT: Record<string, string> = {
  TECHNICAL: "Kỹ thuật",
  CLEANING: "Vệ sinh",
  SECURITY: "An ninh",
  LANDSCAPE: "Cảnh quan",
  FACILITY: "Cơ sở vật chất",
  OTHER: "Khác",
};
const blank = {
  mallId: "",
  name: "",
  category: "TECHNICAL",
  title: "",
  priority: "MEDIUM",
  location: "",
  assignedDepartment: "",
  assigneeId: "",
  frequency: "DAILY",
  nextRunAt: "",
  dueHours: 24,
  checklistText: "",
};

export default function WorkOrderTemplates({ mallId, mallName, users }: any) {
  const qc = useQueryClient(),
    { toast } = useToast();
  const [expanded, setExpanded] = useState(false),
    [open, setOpen] = useState(false),
    [form, setForm] = useState<any>(blank);
  const departments = Array.from(new Set([
    ...Object.values(CAT).filter(value => value !== "Khác"),
    ...users.map((user: any) => user.department).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b, "vi"));
  const query = useQuery({
    queryKey: ["work-order-templates", mallId],
    queryFn: () => workOrdersApi.templates(mallId ? { mallId } : undefined),
    enabled: expanded,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["work-order-templates"] });
    qc.invalidateQueries({ queryKey: ["work-orders"] });
    qc.invalidateQueries({ queryKey: ["work-order-summary"] });
  };
  const action = useMutation({
    mutationFn: ({ kind, row }: any) =>
      kind === "create"
        ? workOrdersApi.createTemplate(row)
        : kind === "run"
          ? workOrdersApi.runTemplate(row.id)
          : workOrdersApi.toggleTemplate(row.id, !row.isActive),
    onSuccess: (result: any, variables: any) => {
      refresh();
      setOpen(false);
      toast({
        title:
          variables.kind === "run" && result?.created === false
            ? "Kỳ này đã có Work Order"
            : "Đã cập nhật mẫu công việc",
      });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật mẫu",
        description: e?.response?.data?.message || e?.message,
        variant: "destructive",
      }),
  });
  const create = () => {
    if (
      !form.mallId ||
      !form.name.trim() ||
      !form.title.trim() ||
      !form.nextRunAt
    )
      return toast({
        title: "Vui lòng nhập đủ trường bắt buộc",
        variant: "destructive",
      });
    action.mutate({
      kind: "create",
      row: {
        ...form,
        assigneeId: form.assigneeId || undefined,
        nextRunAt: new Date(form.nextRunAt).toISOString(),
        checklist: form.checklistText
          .split("\n")
          .map((x: string) => x.trim())
          .filter(Boolean),
        checklistText: undefined,
      },
    });
  };
  const rows: any[] = query.data || [];
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <button
          className="flex items-center gap-2 text-left font-semibold"
          onClick={() => setExpanded(!expanded)}
        >
          <CalendarClock className="h-5 w-5" />
          Mẫu công việc và lịch định kỳ{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {expanded ? "Thu gọn" : "Mở quản lý"}
          </span>
        </button>
        <Button
          size="sm"
          onClick={() => {
            if (!mallId) {
              toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
              return;
            }
            setForm({ ...blank, mallId });
            setOpen(true);
            setExpanded(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          Tạo mẫu
        </Button>
      </div>
      {expanded && (
        <div className="border-t p-4">
          {query.isLoading ? (
            <p>Đang tải...</p>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground">
              Chưa có mẫu định kỳ.
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-md border p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.mall?.name} · {CAT[row.category] || row.category}
                      </div>
                    </div>
                    <Badge variant={row.isActive ? "default" : "secondary"}>
                      {row.isActive ? "Đang chạy" : "Tạm dừng"}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm">
                    <div>{row.title}</div>
                    <div className="text-muted-foreground">
                      {FREQ[row.frequency]} · Kỳ tới:{" "}
                      {new Date(row.nextRunAt).toLocaleString("vi-VN")} · SLA{" "}
                      {row.dueHours} giờ
                    </div>
                    <div className="text-muted-foreground">
                      Đã sinh {row._count?.workOrders || 0} Work Order
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ kind: "run", row })}
                    >
                      <Play className="mr-1 h-3 w-3" />
                      Chạy ngay
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={action.isPending}
                      onClick={() => action.mutate({ kind: "toggle", row })}
                    >
                      {row.isActive ? (
                        <Pause className="mr-1 h-3 w-3" />
                      ) : (
                        <Play className="mr-1 h-3 w-3" />
                      )}
                      {row.isActive ? "Tạm dừng" : "Kích hoạt"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tạo mẫu công việc định kỳ</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Trung tâm thương mại *
              <span className="mt-1 flex h-10 w-full items-center rounded-md border bg-muted/40 px-3">
                {mallName}
              </span>
            </label>
            <label className="text-sm">
              Tên mẫu *
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Nhóm
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {Object.entries(CAT).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Tần suất
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={form.frequency}
                onChange={(e) =>
                  setForm({ ...form, frequency: e.target.value })
                }
              >
                {Object.entries(FREQ).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Tiêu đề Work Order *
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="text-sm">
              Lần chạy tiếp theo *
              <Input
                className="mt-1"
                type="datetime-local"
                value={form.nextRunAt}
                onChange={(e) =>
                  setForm({ ...form, nextRunAt: e.target.value })
                }
              />
            </label>
            <label className="text-sm">
              SLA (giờ)
              <Input
                className="mt-1"
                type="number"
                min={1}
                value={form.dueHours}
                onChange={(e) =>
                  setForm({ ...form, dueHours: Number(e.target.value) })
                }
              />
            </label>
            <label className="text-sm">
              Bộ phận
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={form.assignedDepartment}
                onChange={(e) =>
                  setForm({ ...form, assignedDepartment: e.target.value })
                }
              >
                <option value="">Chọn bộ phận xử lý</option>
                {departments.map(value => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm">
              Người phụ trách
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
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
                {users.map((x: any) => (
                  <option key={x.id} value={x.id}>
                    {x.fullName}{x.department ? ` — ${x.department}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              Vị trí
              <Input
                className="mt-1"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              Checklist (mỗi dòng một mục)
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border p-3"
                value={form.checklistText}
                onChange={(e) =>
                  setForm({ ...form, checklistText: e.target.value })
                }
              />
            </label>
          </div>
          <Button onClick={create} disabled={action.isPending}>
            {action.isPending ? "Đang lưu..." : "Lưu mẫu"}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
