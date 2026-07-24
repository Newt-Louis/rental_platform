import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  MapPinned,
  Play,
  Plus,
  Route,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { patrolApi, spacesApi, usersApi } from "@/api";
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

const STATUS: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang tuần tra",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  OVERDUE: "Quá hạn",
};
const routeBlank = {
  mallId: "",
  code: "",
  name: "",
  description: "",
  pointsText: "",
};
const shiftBlank = {
  mallId: "",
  routeId: "",
  assigneeId: "",
  scheduledAt: "",
  notes: "",
};
export default function PatrolPage() {
  const qc = useQueryClient(),
    { toast } = useToast(),
    selectedMallId = useMallStore((s) => s.selectedMallId);
  const [mallId, setMallId] = useState(selectedMallId || ""),
    [routeOpen, setRouteOpen] = useState(false),
    [shiftOpen, setShiftOpen] = useState(false),
    [selectedId, setSelectedId] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<any>(routeBlank),
    [shiftForm, setShiftForm] = useState<any>(shiftBlank);
  const mallsQ = useQuery({
    queryKey: ["malls"],
    queryFn: spacesApi.listMalls,
  });
  const usersQ = useQuery({
    queryKey: ["patrol-users"],
    queryFn: () => usersApi.listUsers({ limit: 200 }),
  });
  const routesQ = useQuery({
    queryKey: ["patrol-routes", mallId],
    queryFn: () => patrolApi.routes(mallId || undefined),
  });
  const shiftsQ = useQuery({
    queryKey: ["patrol-shifts", mallId],
    queryFn: () => patrolApi.shifts(mallId ? { mallId } : undefined),
  });
  const summaryQ = useQuery({
    queryKey: ["patrol-summary", mallId],
    queryFn: () => patrolApi.summary(mallId || undefined),
  });
  const detailQ = useQuery({
    queryKey: ["patrol-shift", selectedId],
    queryFn: () => patrolApi.shift(selectedId!),
    enabled: !!selectedId,
  });
  const malls: any[] = Array.isArray(mallsQ.data)
      ? mallsQ.data
      : (mallsQ.data as any)?.data || [],
    users: any[] = ((usersQ.data as any)?.data || usersQ.data || []).filter(
      (u: any) => u.role !== "TENANT",
    ),
    routes: any[] = routesQ.data || [],
    shifts: any[] = shiftsQ.data || [],
    summary: any = summaryQ.data || {},
    detail: any = detailQ.data;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["patrol"] });
    qc.invalidateQueries({ queryKey: ["work-orders"] });
  };
  const action = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "route"
        ? patrolApi.createRoute(data)
        : kind === "shift"
          ? patrolApi.createShift(data)
          : kind === "start"
            ? patrolApi.start(data.id)
            : kind === "complete"
              ? patrolApi.complete(data.id)
              : patrolApi.check(data.id, data.body),
    onSuccess: () => {
      refresh();
      setRouteOpen(false);
      setShiftOpen(false);
      toast({ title: "Đã cập nhật tuần tra" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể cập nhật",
        description: e?.response?.data?.message || e?.message,
        variant: "destructive",
      }),
  });
  const upload = useMutation({
    mutationFn: ({ id, file }: any) => patrolApi.evidence(id, file),
    onSuccess: refresh,
    onError: (e: any) =>
      toast({
        title: "Không thể tải minh chứng",
        description: e?.response?.data?.message,
        variant: "destructive",
      }),
  });
  const createRoute = () =>
    action.mutate({
      kind: "route",
      data: {
        ...routeForm,
        points: routeForm.pointsText
          .split("\n")
          .map((x: string, i: number) => {
            const [name, location] = x.split("|").map((v) => v.trim());
            return name ? { code: `P${i + 1}`, name, location } : null;
          })
          .filter(Boolean),
        pointsText: undefined,
      },
    });
  const createShift = () =>
    action.mutate({
      kind: "shift",
      data: {
        ...shiftForm,
        scheduledAt: new Date(shiftForm.scheduledAt).toISOString(),
        assigneeId: shiftForm.assigneeId || undefined,
      },
    });
  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <ShieldCheck />
            Tuần tra an ninh
          </h1>
          <p className="text-sm text-muted-foreground">
            Tuyến · điểm kiểm tra · ca trực · minh chứng · xử lý bất thường
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setRouteForm({
                ...routeBlank,
                mallId: mallId || malls[0]?.id || "",
              });
              setRouteOpen(true);
            }}
          >
            <Route className="mr-2 h-4 w-4" />
            Tạo tuyến
          </Button>
          <Button
            onClick={() => {
              setShiftForm({
                ...shiftBlank,
                mallId: mallId || malls[0]?.id || "",
              });
              setShiftOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Lên ca tuần tra
          </Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tổng ca", summary.total || 0, MapPinned],
          ["Đang chờ/xử lý", summary.active || 0, Play],
          ["Hoàn thành", summary.completed || 0, CheckCircle2],
          ["Bất thường", summary.abnormal || 0, AlertTriangle],
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
      <select
        className="h-10 min-w-72 rounded-md border px-3"
        value={mallId}
        onChange={(e) => setMallId(e.target.value)}
      >
        <option value="">Tất cả trung tâm thương mại</option>
        {malls.map((x: any) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4 lg:col-span-1">
          <h2 className="mb-3 font-semibold">Tuyến tuần tra</h2>
          <div className="space-y-3">
            {routes.map((x) => (
              <div key={x.id} className="rounded-md border p-3">
                <div className="font-medium">
                  {x.code} · {x.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {x.mall?.name} · {x.points.length} điểm ·{" "}
                  {x._count?.shifts || 0} ca
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border bg-card lg:col-span-2">
          <div className="border-b p-4 font-semibold">
            Danh sách ca tuần tra
          </div>
          <div className="divide-y">
            {shifts.map((x) => (
              <button
                key={x.id}
                onClick={() => setSelectedId(x.id)}
                className="flex w-full items-center justify-between gap-3 p-4 text-left hover:bg-muted"
              >
                <div>
                  <div className="font-medium">
                    {x.shiftNumber} · {x.route?.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {x.mall?.name} · {x.assignee?.fullName || "Chưa phân công"}{" "}
                    · {new Date(x.scheduledAt).toLocaleString("vi-VN")}
                  </div>
                </div>
                <Badge>{STATUS[x.status] || x.status}</Badge>
              </button>
            ))}
          </div>
        </div>
      </div>
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo tuyến tuần tra</DialogTitle>
          </DialogHeader>
          <select
            className="h-10 rounded-md border px-3"
            value={routeForm.mallId}
            onChange={(e) =>
              setRouteForm({ ...routeForm, mallId: e.target.value })
            }
          >
            <option value="">Chọn Mall</option>
            {malls.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <Input
            placeholder="Mã tuyến"
            value={routeForm.code}
            onChange={(e) =>
              setRouteForm({ ...routeForm, code: e.target.value })
            }
          />
          <Input
            placeholder="Tên tuyến"
            value={routeForm.name}
            onChange={(e) =>
              setRouteForm({ ...routeForm, name: e.target.value })
            }
          />
          <textarea
            className="min-h-32 rounded-md border p-3"
            placeholder={"Mỗi dòng: Tên điểm | Vị trí\nCửa chính | Tầng 1"}
            value={routeForm.pointsText}
            onChange={(e) =>
              setRouteForm({ ...routeForm, pointsText: e.target.value })
            }
          />
          <Button onClick={createRoute}>Lưu tuyến</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lên ca tuần tra</DialogTitle>
          </DialogHeader>
          <select
            className="h-10 rounded-md border px-3"
            value={shiftForm.mallId}
            onChange={(e) =>
              setShiftForm({
                ...shiftForm,
                mallId: e.target.value,
                routeId: "",
              })
            }
          >
            <option value="">Chọn Mall</option>
            {malls.map((x: any) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={shiftForm.routeId}
            onChange={(e) =>
              setShiftForm({ ...shiftForm, routeId: e.target.value })
            }
          >
            <option value="">Chọn tuyến</option>
            {routes
              .filter((x) => !shiftForm.mallId || x.mallId === shiftForm.mallId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
          <select
            className="h-10 rounded-md border px-3"
            value={shiftForm.assigneeId}
            onChange={(e) =>
              setShiftForm({ ...shiftForm, assigneeId: e.target.value })
            }
          >
            <option value="">Chưa phân công</option>
            {users.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fullName}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={shiftForm.scheduledAt}
            onChange={(e) =>
              setShiftForm({ ...shiftForm, scheduledAt: e.target.value })
            }
          />
          <Button onClick={createShift}>Tạo ca</Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.shiftNumber} · {detail?.route?.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <>
              <div className="flex gap-2">
                <Badge>{STATUS[detail.status]}</Badge>
                {["SCHEDULED", "OVERDUE"].includes(detail.status) && (
                  <Button
                    size="sm"
                    onClick={() =>
                      action.mutate({ kind: "start", data: detail })
                    }
                  >
                    Bắt đầu
                  </Button>
                )}
                {detail.status === "IN_PROGRESS" && (
                  <Button
                    size="sm"
                    onClick={() =>
                      action.mutate({ kind: "complete", data: detail })
                    }
                  >
                    Hoàn thành ca
                  </Button>
                )}
              </div>
              <div className="space-y-3">
                {detail.checks.map((c: any) => (
                  <div key={c.id} className="rounded-md border p-4">
                    <div className="flex justify-between">
                      <div>
                        <div className="font-medium">
                          {c.point.code} · {c.point.name}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {c.point.location}
                        </div>
                      </div>
                      <Badge
                        variant={
                          c.result === "ABNORMAL"
                            ? "destructive"
                            : c.result === "NORMAL"
                              ? "default"
                              : "secondary"
                        }
                      >
                        {c.result}
                      </Badge>
                    </div>
                    {detail.status === "IN_PROGRESS" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            action.mutate({
                              kind: "check",
                              data: { id: c.id, body: { result: "NORMAL" } },
                            })
                          }
                        >
                          Bình thường
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            const note = prompt("Mô tả bất thường:");
                            if (note)
                              action.mutate({
                                kind: "check",
                                data: {
                                  id: c.id,
                                  body: { result: "ABNORMAL", note },
                                },
                              });
                          }}
                        >
                          Bất thường
                        </Button>
                        <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm">
                          <Upload className="mr-1 h-3 w-3" />
                          Minh chứng
                          <input
                            type="file"
                            className="hidden"
                            onChange={(e) =>
                              e.target.files?.[0] &&
                              upload.mutate({
                                id: c.id,
                                file: e.target.files[0],
                              })
                            }
                          />
                        </label>
                      </div>
                    )}
                    {c.workOrderId && (
                      <div className="mt-2 text-sm text-destructive">
                        Đã tạo Work Order xử lý sự cố
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
