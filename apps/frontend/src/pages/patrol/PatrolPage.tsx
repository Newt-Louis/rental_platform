import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MapPinned,
  Navigation,
  Pencil,
  Play,
  Plus,
  QrCode,
  Route,
  ShieldCheck,
  Trash2,
  Upload,
  UserCog,
} from "lucide-react";
import { patrolApi, usersApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { AuthenticatedImage } from "@/components/ui/authenticated-image";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { ReasonActionDialog } from "@/components/ui/reason-action-dialog";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page-header";
import { ERPToolbar } from "@/components/erp";

const STATUS: Record<string, string> = {
  SCHEDULED: "Đã lên lịch",
  IN_PROGRESS: "Đang tuần tra",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã hủy",
  OVERDUE: "Quá hạn",
};
const SEVERITY_LABEL: Record<string, string> = {
  LOW: "Thấp",
  MEDIUM: "Trung bình",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};
const DOW_LABELS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const PAGE_SIZE = 20;

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
const pointBlank = {
  name: "",
  code: "",
  location: "",
  instructions: "",
  isRequired: true,
  requirePhoto: true,
  requireQrScan: false,
  latitude: "",
  longitude: "",
  geofenceRadius: "",
};
const scheduleBlank = {
  mallId: "",
  routeId: "",
  name: "",
  assigneeId: "",
  daysOfWeek: [] as number[],
  timesOfDayText: "08:00, 14:00, 20:00",
  generateDaysAhead: 1,
};

function getGeo(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    let done = false;
    const finish = (v: { latitude: number; longitude: number } | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), 4000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        finish({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        finish(null);
      },
      { timeout: 3500, maximumAge: 30000 },
    );
  });
}

export default function PatrolPage() {
  const { t } = useTranslation("patrol");
  const qc = useQueryClient(),
    { toast } = useToast(),
    selectedMallId = useMallStore((s) => s.selectedMallId),
    selectedMallName = useMallStore((s) => s.selectedMallName),
    openMallContextModal = useMallStore((s) => s.openMallContextModal);
  const mallId = selectedMallId || "";
  const [routeOpen, setRouteOpen] = useState(false),
    [shiftOpen, setShiftOpen] = useState(false),
    [scheduleOpen, setScheduleOpen] = useState(false),
    [pointDialog, setPointDialog] = useState<{ routeId: string; point?: any } | null>(null),
    [selectedId, setSelectedId] = useState<string | null>(null),
    [cancelTarget, setCancelTarget] = useState<string | null>(null),
    [deleteTarget, setDeleteTarget] = useState<{ kind: "point" | "schedule"; id: string } | null>(null),
    [abnormalTarget, setAbnormalTarget] = useState<{ checkId: string; pointName: string } | null>(null);
  const [routeForm, setRouteForm] = useState<any>(routeBlank),
    [shiftForm, setShiftForm] = useState<any>(shiftBlank),
    [pointForm, setPointForm] = useState<any>(pointBlank),
    [scheduleForm, setScheduleForm] = useState<any>(scheduleBlank),
    [abnormalForm, setAbnormalForm] = useState({ severity: "MEDIUM", note: "" }),
    [qrInputs, setQrInputs] = useState<Record<string, string>>({});
  const [shiftFilters, setShiftFilters] = useState({
    status: "",
    assigneeId: "",
    routeId: "",
    from: "",
    to: "",
    page: 1,
  });
  const [reportRange, setReportRange] = useState({ from: "", to: "" });

  useEffect(() => {
    setSelectedId(null);
    setRouteOpen(false);
    setShiftOpen(false);
    setScheduleOpen(false);
    setRouteForm({ ...routeBlank, mallId });
    setShiftForm({ ...shiftBlank, mallId });
    setScheduleForm({ ...scheduleBlank, mallId });
    setShiftFilters((current) => ({ ...current, routeId: "", page: 1 }));
  }, [mallId]);

  const usersQ = useQuery({
    queryKey: ["patrol-users"],
    queryFn: () => usersApi.listUsers({ limit: 200 }),
  });
  const routesQ = useQuery({
    queryKey: ["patrol-routes", mallId],
    queryFn: () => patrolApi.routes(mallId || undefined),
  });
  const schedulesQ = useQuery({
    queryKey: ["patrol-schedules", mallId],
    queryFn: () => patrolApi.schedules(mallId ? { mallId } : undefined),
  });
  const shiftsQ = useQuery({
    queryKey: ["patrol-shifts", mallId, shiftFilters],
    queryFn: () =>
      patrolApi.shifts({
        mallId: mallId || undefined,
        pageSize: PAGE_SIZE,
        ...shiftFilters,
      }),
  });
  const summaryQ = useQuery({
    queryKey: ["patrol-summary", mallId],
    queryFn: () => patrolApi.summary({ mallId: mallId || undefined }),
  });
  const reportQ = useQuery({
    queryKey: ["patrol-report", mallId, reportRange],
    queryFn: () =>
      patrolApi.report({
        mallId: mallId || undefined,
        from: reportRange.from || undefined,
        to: reportRange.to || undefined,
      }),
  });
  const detailQ = useQuery({
    queryKey: ["patrol-shift", selectedId],
    queryFn: () => patrolApi.shift(selectedId!),
    enabled: !!selectedId,
  });

  const users: any[] = ((usersQ.data as any)?.data || usersQ.data || []).filter(
      (u: any) => u.role !== "TENANT",
    ),
    routes: any[] = routesQ.data || [],
    schedules: any[] = schedulesQ.data || [],
    shiftsResp: any = shiftsQ.data || {},
    shifts: any[] = shiftsResp.data || [],
    shiftsTotal: number = shiftsResp.total || 0,
    summary: any = summaryQ.data || {},
    report: any = reportQ.data || {},
    detail: any = detailQ.data;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["patrol-routes"] });
    qc.invalidateQueries({ queryKey: ["patrol-shifts"] });
    qc.invalidateQueries({ queryKey: ["patrol-summary"] });
    qc.invalidateQueries({ queryKey: ["patrol-report"] });
    qc.invalidateQueries({ queryKey: ["patrol-schedules"] });
    if (selectedId) qc.invalidateQueries({ queryKey: ["patrol-shift", selectedId] });
    qc.invalidateQueries({ queryKey: ["work-orders"] });
  };
  const onErr = (title: string) => (e: any) =>
    toast({
      title,
      description: e?.response?.data?.message || e?.message,
      variant: "destructive",
    });

  const routeMutation = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "create"
        ? patrolApi.createRoute(data)
        : patrolApi.updateRoute(data.id, data),
    onSuccess: () => {
      invalidateAll();
      setRouteOpen(false);
      toast({ title: "Đã lưu tuyến tuần tra" });
    },
    onError: onErr("Không thể lưu tuyến"),
  });
  const pointMutation = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "add"
        ? patrolApi.addPoint(data.routeId, data)
        : kind === "update"
          ? patrolApi.updatePoint(data.id, data)
          : kind === "delete"
            ? patrolApi.deletePoint(data.id)
            : patrolApi.reorderPoints(data.routeId, data.orderedIds),
    onSuccess: () => {
      invalidateAll();
      setPointDialog(null);
      setDeleteTarget(null);
      toast({ title: "Đã cập nhật điểm kiểm tra" });
    },
    onError: onErr("Không thể cập nhật điểm kiểm tra"),
  });
  const shiftMutation = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "create"
        ? patrolApi.createShift(data)
        : kind === "start"
          ? patrolApi.start(data.id)
          : kind === "complete"
            ? patrolApi.complete(data.id)
            : kind === "cancel"
              ? patrolApi.cancelShift(data.id, data.reason)
              : patrolApi.reassignShift(data.id, data.assigneeId),
    onSuccess: () => {
      invalidateAll();
      setShiftOpen(false);
      setCancelTarget(null);
      toast({ title: "Đã cập nhật ca tuần tra" });
    },
    onError: onErr("Không thể cập nhật ca"),
  });
  const checkMutation = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "check"
        ? patrolApi.check(data.id, data.body)
        : patrolApi.evidence(data.id, data.file),
    onSuccess: () => {
      invalidateAll();
      setAbnormalTarget(null);
    },
    onError: onErr("Không thể ghi nhận kiểm tra"),
  });
  const scheduleMutation = useMutation({
    mutationFn: ({ kind, data }: any) =>
      kind === "create"
        ? patrolApi.createSchedule(data)
        : kind === "update"
          ? patrolApi.updateSchedule(data.id, data)
          : patrolApi.deleteSchedule(data.id),
    onSuccess: () => {
      invalidateAll();
      setScheduleOpen(false);
      setDeleteTarget(null);
      toast({ title: "Đã cập nhật lịch tuần tra" });
    },
    onError: onErr("Không thể cập nhật lịch tuần tra"),
  });

  const createRoute = () =>
    routeMutation.mutate({
      kind: "create",
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
    shiftMutation.mutate({
      kind: "create",
      data: {
        ...shiftForm,
        scheduledAt: new Date(shiftForm.scheduledAt).toISOString(),
        assigneeId: shiftForm.assigneeId || undefined,
      },
    });
  const savePoint = () => {
    const data = {
      ...pointForm,
      latitude: pointForm.latitude === "" ? undefined : Number(pointForm.latitude),
      longitude: pointForm.longitude === "" ? undefined : Number(pointForm.longitude),
      geofenceRadius:
        pointForm.geofenceRadius === "" ? undefined : Number(pointForm.geofenceRadius),
    };
    if (pointDialog?.point)
      pointMutation.mutate({ kind: "update", data: { ...data, id: pointDialog.point.id } });
    else pointMutation.mutate({ kind: "add", data: { ...data, routeId: pointDialog!.routeId } });
  };
  const movePoint = (route: any, index: number, dir: -1 | 1) => {
    const ids = route.points.map((p: any) => p.id);
    const target = index + dir;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    pointMutation.mutate({ kind: "reorder", data: { routeId: route.id, orderedIds: ids } });
  };
  const saveSchedule = () => {
    const timesOfDay = scheduleForm.timesOfDayText
      .split(",")
      .map((t: string) => t.trim())
      .filter(Boolean);
    const data = { ...scheduleForm, timesOfDay, timesOfDayText: undefined };
    if (scheduleForm.id) scheduleMutation.mutate({ kind: "update", data });
    else scheduleMutation.mutate({ kind: "create", data });
  };

  const submitCheck = async (checkId: string, result: "NORMAL" | "ABNORMAL", extra?: any) => {
    const point = detail?.checks?.find((c: any) => c.id === checkId)?.point;
    if (point?.requireQrScan && !qrInputs[checkId]?.trim()) {
      toast({
        title: "Thiếu mã xác thực",
        description: "Điểm này yêu cầu nhập mã QR/mã xác thực trước khi kiểm tra",
        variant: "destructive",
      });
      return;
    }
    const geo = await getGeo();
    checkMutation.mutate({
      kind: "check",
      data: {
        id: checkId,
        body: {
          result,
          qrToken: qrInputs[checkId]?.trim() || undefined,
          latitude: geo?.latitude,
          longitude: geo?.longitude,
          ...extra,
        },
      },
    });
  };

  const patrolUsers = users.filter((u: any) =>
    ["OPERATION", "MALL_DIRECTOR", "ADMIN"].includes(u.role),
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader eyebrow={t("page.eyebrow")} title={t("page.title")} description={t("page.subtitle")} />

      <div className="grid grid-cols-2 border-y bg-card lg:grid-cols-5">
        {[
          [t("summary.total"), summary.total || 0, MapPinned],
          [t("summary.active"), summary.active || 0, Play],
          [t("summary.completed"), summary.completed || 0, CheckCircle2],
          [t("summary.abnormal"), summary.abnormal || 0, AlertTriangle],
          [t("summary.suspicious"), summary.suspicious || 0, ShieldCheck],
        ].map(([l, v, I]: any) => (
          <div key={l} className="border-b px-4 py-3 even:border-l lg:border-b-0 lg:border-l lg:first:border-l-0">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground"><I className="h-3.5 w-3.5" />{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>

      <Tabs defaultValue="shifts">
        <TabsList>
          <TabsTrigger value="shifts">{t("tabs.shifts")}</TabsTrigger>
          <TabsTrigger value="routes">{t("tabs.routes")}</TabsTrigger>
          <TabsTrigger value="schedules">{t("tabs.schedules")}</TabsTrigger>
          <TabsTrigger value="reports">{t("tabs.reports")}</TabsTrigger>
        </TabsList>

        {/* ---- SHIFTS TAB ---- */}
        <TabsContent value="shifts" className="space-y-3">
          <ERPToolbar>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={shiftFilters.status}
              onChange={(e) =>
                setShiftFilters({ ...shiftFilters, status: e.target.value, page: 1 })
              }
            >
              <option value="">{t("filters.allStatuses")}</option>
              {Object.keys(STATUS).map((k) => (
                <option key={k} value={k}>
                  {t(`status.${k}`)}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={shiftFilters.routeId}
              onChange={(e) =>
                setShiftFilters({ ...shiftFilters, routeId: e.target.value, page: 1 })
              }
            >
              <option value="">{t("filters.allRoutes")}</option>
              {routes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border px-2 text-sm"
              value={shiftFilters.assigneeId}
              onChange={(e) =>
                setShiftFilters({ ...shiftFilters, assigneeId: e.target.value, page: 1 })
              }
            >
              <option value="">{t("filters.allAssignees")}</option>
              {patrolUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </select>
            <DateRangePicker
              from={shiftFilters.from}
              to={shiftFilters.to}
              onFromChange={(v) => setShiftFilters({ ...shiftFilters, from: v, page: 1 })}
              onToChange={(v) => setShiftFilters({ ...shiftFilters, to: v, page: 1 })}
            />
            <Button
              className="ml-auto"
              onClick={() => {
                if (!mallId) {
                  openMallContextModal();
                  return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
                }
                setShiftForm({ ...shiftBlank, mallId });
                setShiftOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {t("actions.createShift")}
            </Button>
          </ERPToolbar>
          <div className="rounded-lg border bg-card">
            <div className="divide-y">
              {shifts.map((x) => (
                <div key={x.id} className="flex items-center justify-between gap-3 p-4">
                  <button
                    onClick={() => setSelectedId(x.id)}
                    className="flex-1 text-left hover:underline"
                  >
                    <div className="font-medium">
                      {x.shiftNumber} · {x.route?.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {x.mall?.name} · {x.assignee?.fullName || "Chưa phân công"} ·{" "}
                      {new Date(x.scheduledAt).toLocaleString("vi-VN")} ·{" "}
                      {x._count?.checks || 0} điểm
                    </div>
                  </button>
                  <Badge>{t(`status.${x.status}`, { defaultValue: t('common:unknownValue') })}</Badge>
                  {["SCHEDULED", "OVERDUE"].includes(x.status) && (
                    <Button
                      size="sm"
                      variant="outline"
                      title="Hủy ca"
                      onClick={() => setCancelTarget(x.id)}
                    >
                      <Ban className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
              {!shifts.length && (
                <div className="p-6 text-center text-sm text-muted-foreground">
                  {t("empty.shifts")}
                </div>
              )}
            </div>
            {shiftsTotal > PAGE_SIZE && (
              <div className="flex items-center justify-between border-t p-3 text-sm">
                <span className="text-muted-foreground">
                  Trang {shiftFilters.page} / {Math.ceil(shiftsTotal / PAGE_SIZE)} ·{" "}
                  {shiftsTotal} ca
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={shiftFilters.page <= 1}
                    onClick={() => setShiftFilters({ ...shiftFilters, page: shiftFilters.page - 1 })}
                  >
                    Trước
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={shiftFilters.page >= Math.ceil(shiftsTotal / PAGE_SIZE)}
                    onClick={() => setShiftFilters({ ...shiftFilters, page: shiftFilters.page + 1 })}
                  >
                    Sau
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- ROUTES TAB ---- */}
        <TabsContent value="routes" className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                if (!mallId) {
                  openMallContextModal();
                  return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
                }
                setRouteForm({ ...routeBlank, mallId });
                setRouteOpen(true);
              }}
            >
              <Route className="mr-2 h-4 w-4" />
              {t("actions.createRoute")}
            </Button>
          </div>
          <div className="space-y-4">
            {routes.map((r) => (
              <div key={r.id} className="rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold">
                      {r.code} · {r.name}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {r.mall?.name} · {r.points.length} điểm · {r._count?.shifts || 0} ca
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setPointDialog({ routeId: r.id, point: undefined })
                      }
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      Thêm điểm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        routeMutation.mutate({
                          kind: "update",
                          data: { id: r.id, isActive: !r.isActive },
                        })
                      }
                    >
                      {r.isActive ? "Ngưng dùng" : "Kích hoạt lại"}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {r.points.map((p: any, i: number) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm"
                    >
                      <div>
                        <div className="font-medium">
                          {p.code} · {p.name}{" "}
                          {!p.isRequired && (
                            <span className="text-xs text-muted-foreground">(không bắt buộc)</span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                          {p.location && <span>{p.location}</span>}
                          {p.requirePhoto && (
                            <Badge variant="secondary" className="text-[10px]">
                              Bắt buộc ảnh
                            </Badge>
                          )}
                          {p.requireQrScan && (
                            <Badge variant="secondary" className="text-[10px]">
                              <QrCode className="mr-1 h-3 w-3" />
                              Mã: {p.qrToken}
                            </Badge>
                          )}
                          {p.geofenceRadius && (
                            <Badge variant="secondary" className="text-[10px]">
                              Bán kính {p.geofenceRadius}m
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="ghost" onClick={() => movePoint(r, i, -1)}>
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => movePoint(r, i, 1)}>
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setPointForm({
                              ...p,
                              latitude: p.latitude ?? "",
                              longitude: p.longitude ?? "",
                              geofenceRadius: p.geofenceRadius ?? "",
                            });
                            setPointDialog({ routeId: r.id, point: p });
                          }}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDeleteTarget({ kind: "point", id: p.id })}
                        >
                          <Trash2 className="h-3 w-3 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ---- SCHEDULES TAB ---- */}
        <TabsContent value="schedules" className="space-y-3">
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                if (!mallId) {
                  openMallContextModal();
                  return toast({ title: "Vui lòng chọn Mall tại bộ chọn chung", variant: "destructive" });
                }
                setScheduleForm({ ...scheduleBlank, mallId });
                setScheduleOpen(true);
              }}
            >
              <CalendarClock className="mr-2 h-4 w-4" />
              {t("actions.createSchedule")}
            </Button>
          </div>
          <div className="rounded-lg border bg-card divide-y">
            {schedules.map((s) => (
              <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <div className="font-medium">
                    {s.name} · {s.route?.name}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {s.mall?.name} · {s.assignee?.fullName || "Chưa phân công"} ·{" "}
                    {s.timesOfDay.join(", ")} ·{" "}
                    {s.daysOfWeek.length
                      ? s.daysOfWeek.map((d: number) => DOW_LABELS[d]).join("/")
                      : "Hằng ngày"}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={s.isActive ? "default" : "secondary"}>
                    {s.isActive ? "Đang bật" : "Đã tắt"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      scheduleMutation.mutate({
                        kind: "update",
                        data: { id: s.id, isActive: !s.isActive },
                      })
                    }
                  >
                    {s.isActive ? "Tắt" : "Bật"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteTarget({ kind: "schedule", id: s.id })}
                  >
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {!schedules.length && (
              <div className="p-6 text-center text-sm text-muted-foreground">
                Chưa có lịch tuần tra định kỳ nào
              </div>
            )}
          </div>
        </TabsContent>

        {/* ---- REPORTS TAB ---- */}
        <TabsContent value="reports" className="space-y-4">
          <DateRangePicker
            from={reportRange.from}
            to={reportRange.to}
            onFromChange={(v) => setReportRange({ ...reportRange, from: v })}
            onToChange={(v) => setReportRange({ ...reportRange, to: v })}
            placeholder="30 ngày gần nhất"
          />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Số ca", report.totals?.shifts || 0],
              ["Hoàn thành", report.totals?.completed || 0],
              ["Bất thường", report.totals?.abnormal || 0],
              ["Đúng giờ", `${report.totals?.onTimeRate || 0}%`],
            ].map(([l, v]: any) => (
              <div key={l} className="rounded-lg border bg-card p-4">
                <div className="text-sm text-muted-foreground">{l}</div>
                <div className="mt-2 text-2xl font-bold">{v}</div>
              </div>
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <BarChart3 className="h-4 w-4" /> Theo tuyến
              </h3>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Tuyến</th>
                    <th className="text-right font-normal">Ca</th>
                    <th className="text-right font-normal">Hoàn thành</th>
                    <th className="text-right font-normal">Bất thường</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.byRoute || []).map((x: any) => (
                    <tr key={x.routeId} className="border-t">
                      <td className="py-1">{x.name}</td>
                      <td className="text-right">{x.total}</td>
                      <td className="text-right">{x.completed}</td>
                      <td className="text-right">{x.abnormal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold">
                <UserCog className="h-4 w-4" /> Theo người phụ trách
              </h3>
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left font-normal">Người phụ trách</th>
                    <th className="text-right font-normal">Ca</th>
                    <th className="text-right font-normal">Hoàn thành</th>
                    <th className="text-right font-normal">Bất thường</th>
                  </tr>
                </thead>
                <tbody>
                  {(report.byAssignee || []).map((x: any) => (
                    <tr key={x.assigneeId || "unassigned"} className="border-t">
                      <td className="py-1">{x.name}</td>
                      <td className="text-right">{x.total}</td>
                      <td className="text-right">{x.completed}</td>
                      <td className="text-right">{x.abnormal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {!!(report.suspicious || []).length && (
            <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4">
              <h3 className="mb-2 flex items-center gap-2 font-semibold text-destructive">
                <ShieldCheck className="h-4 w-4" /> Ca nghi vấn (đi quá nhanh / sai vị trí điểm)
              </h3>
              <div className="space-y-1 text-sm">
                {report.suspicious.map((s: any) => (
                  <button
                    key={s.shiftId}
                    onClick={() => setSelectedId(s.shiftId)}
                    className="block text-left hover:underline"
                  >
                    {s.shiftNumber} · {s.route} · {s.assignee || "Chưa phân công"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Route create/edit dialog */}
      <Dialog open={routeOpen} onOpenChange={setRouteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo tuyến tuần tra</DialogTitle>
          </DialogHeader>
          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
            {selectedMallName}
          </div>
          <Input
            placeholder="Mã tuyến"
            value={routeForm.code}
            onChange={(e) => setRouteForm({ ...routeForm, code: e.target.value })}
          />
          <Input
            placeholder="Tên tuyến"
            value={routeForm.name}
            onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })}
          />
          <textarea
            className="min-h-32 rounded-md border p-3"
            placeholder={"Mỗi dòng: Tên điểm | Vị trí\nCửa chính | Tầng 1"}
            value={routeForm.pointsText}
            onChange={(e) => setRouteForm({ ...routeForm, pointsText: e.target.value })}
          />
          <Button onClick={createRoute}>Lưu tuyến</Button>
        </DialogContent>
      </Dialog>

      {/* Shift create dialog */}
      <Dialog open={shiftOpen} onOpenChange={setShiftOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lên ca tuần tra</DialogTitle>
          </DialogHeader>
          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
            {selectedMallName}
          </div>
          <select
            className="h-10 rounded-md border px-3"
            value={shiftForm.routeId}
            onChange={(e) => setShiftForm({ ...shiftForm, routeId: e.target.value })}
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
            onChange={(e) => setShiftForm({ ...shiftForm, assigneeId: e.target.value })}
          >
            <option value="">Chưa phân công</option>
            {patrolUsers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fullName}
              </option>
            ))}
          </select>
          <Input
            type="datetime-local"
            value={shiftForm.scheduledAt}
            onChange={(e) => setShiftForm({ ...shiftForm, scheduledAt: e.target.value })}
          />
          <Button onClick={createShift}>Tạo ca</Button>
        </DialogContent>
      </Dialog>

      {/* Point add/edit dialog */}
      <Dialog open={!!pointDialog} onOpenChange={(o) => !o && setPointDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pointDialog?.point ? "Sửa điểm kiểm tra" : "Thêm điểm kiểm tra"}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Tên điểm"
            value={pointForm.name}
            onChange={(e) => setPointForm({ ...pointForm, name: e.target.value })}
          />
          <Input
            placeholder="Mã điểm (tự sinh nếu để trống)"
            value={pointForm.code}
            onChange={(e) => setPointForm({ ...pointForm, code: e.target.value })}
          />
          <Input
            placeholder="Vị trí (VD: Tầng 1, cửa Nam)"
            value={pointForm.location}
            onChange={(e) => setPointForm({ ...pointForm, location: e.target.value })}
          />
          <Textarea
            placeholder="Hướng dẫn kiểm tra"
            value={pointForm.instructions}
            onChange={(e) => setPointForm({ ...pointForm, instructions: e.target.value })}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              id="p-required"
              checked={pointForm.isRequired}
              onCheckedChange={(v) => setPointForm({ ...pointForm, isRequired: !!v })}
            />
            <Label htmlFor="p-required">Bắt buộc kiểm tra</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="p-photo"
              checked={pointForm.requirePhoto}
              onCheckedChange={(v) => setPointForm({ ...pointForm, requirePhoto: !!v })}
            />
            <Label htmlFor="p-photo">Bắt buộc ảnh minh chứng</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="p-qr"
              checked={pointForm.requireQrScan}
              onCheckedChange={(v) => setPointForm({ ...pointForm, requireQrScan: !!v })}
            />
            <Label htmlFor="p-qr">Bắt buộc quét/nhập mã xác thực tại điểm</Label>
          </div>
          {pointDialog?.point?.qrToken && (
            <div className="rounded-md border bg-muted p-2 text-xs">
              Mã xác thực điểm (dán/in tại vị trí thực tế):{" "}
              <span className="font-mono font-semibold">{pointDialog.point.qrToken}</span>
            </div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <Input
              placeholder="Vĩ độ"
              value={pointForm.latitude}
              onChange={(e) => setPointForm({ ...pointForm, latitude: e.target.value })}
            />
            <Input
              placeholder="Kinh độ"
              value={pointForm.longitude}
              onChange={(e) => setPointForm({ ...pointForm, longitude: e.target.value })}
            />
            <Input
              placeholder="Bán kính (m)"
              value={pointForm.geofenceRadius}
              onChange={(e) => setPointForm({ ...pointForm, geofenceRadius: e.target.value })}
            />
          </div>
          <Button
            variant="outline"
            onClick={async () => {
              const geo = await getGeo();
              if (geo)
                setPointForm({
                  ...pointForm,
                  latitude: geo.latitude,
                  longitude: geo.longitude,
                });
              else
                toast({
                  title: "Không lấy được vị trí",
                  description: "Hãy cho phép truy cập vị trí trên trình duyệt",
                  variant: "destructive",
                });
            }}
          >
            <Navigation className="mr-2 h-4 w-4" />
            Lấy vị trí hiện tại
          </Button>
          <Button onClick={savePoint}>Lưu điểm kiểm tra</Button>
        </DialogContent>
      </Dialog>

      {/* Schedule dialog */}
      <Dialog open={scheduleOpen} onOpenChange={setScheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo lịch tuần tra định kỳ</DialogTitle>
          </DialogHeader>
          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm">
            {selectedMallName}
          </div>
          <select
            className="h-10 rounded-md border px-3"
            value={scheduleForm.routeId}
            onChange={(e) => setScheduleForm({ ...scheduleForm, routeId: e.target.value })}
          >
            <option value="">Chọn tuyến</option>
            {routes
              .filter((x) => !scheduleForm.mallId || x.mallId === scheduleForm.mallId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
          </select>
          <Input
            placeholder="Tên lịch (VD: Tuần tra ca ngày)"
            value={scheduleForm.name}
            onChange={(e) => setScheduleForm({ ...scheduleForm, name: e.target.value })}
          />
          <select
            className="h-10 rounded-md border px-3"
            value={scheduleForm.assigneeId}
            onChange={(e) => setScheduleForm({ ...scheduleForm, assigneeId: e.target.value })}
          >
            <option value="">Chưa phân công cố định</option>
            {patrolUsers.map((x) => (
              <option key={x.id} value={x.id}>
                {x.fullName}
              </option>
            ))}
          </select>
          <div>
            <Label className="mb-1 block">Các ngày trong tuần (bỏ trống = hằng ngày)</Label>
            <div className="flex flex-wrap gap-2">
              {DOW_LABELS.map((label, d) => (
                <label key={d} className="flex items-center gap-1 text-sm">
                  <Checkbox
                    checked={scheduleForm.daysOfWeek.includes(d)}
                    onCheckedChange={(v) =>
                      setScheduleForm({
                        ...scheduleForm,
                        daysOfWeek: v
                          ? [...scheduleForm.daysOfWeek, d]
                          : scheduleForm.daysOfWeek.filter((x: number) => x !== d),
                      })
                    }
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <Input
            placeholder="Khung giờ, cách nhau bởi dấu phẩy (VD: 08:00, 14:00, 20:00)"
            value={scheduleForm.timesOfDayText}
            onChange={(e) => setScheduleForm({ ...scheduleForm, timesOfDayText: e.target.value })}
          />
          <Input
            type="number"
            min={0}
            max={14}
            placeholder="Số ngày tạo trước"
            value={scheduleForm.generateDaysAhead}
            onChange={(e) =>
              setScheduleForm({ ...scheduleForm, generateDaysAhead: Number(e.target.value) })
            }
          />
          <Button onClick={saveSchedule}>Lưu lịch tuần tra</Button>
        </DialogContent>
      </Dialog>

      {/* Cancel shift */}
      <ReasonActionDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title="Hủy ca tuần tra"
        description="Ca tuần tra sẽ chuyển sang trạng thái Đã hủy và không thể khôi phục."
        confirmLabel="Hủy ca"
        loading={shiftMutation.isPending}
        onConfirm={(reason) =>
          shiftMutation.mutate({ kind: "cancel", data: { id: cancelTarget, reason } })
        }
      />

      {/* Delete point/schedule confirm */}
      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={deleteTarget?.kind === "point" ? "Xóa điểm kiểm tra" : "Xóa lịch tuần tra"}
        description="Hành động này không thể hoàn tác."
        destructive
        loading={pointMutation.isPending || scheduleMutation.isPending}
        onConfirm={() =>
          deleteTarget?.kind === "point"
            ? pointMutation.mutate({ kind: "delete", data: { id: deleteTarget.id } })
            : scheduleMutation.mutate({ kind: "delete", data: { id: deleteTarget!.id } })
        }
      />

      {/* Abnormal check dialog */}
      <Dialog open={!!abnormalTarget} onOpenChange={(o) => !o && setAbnormalTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Báo cáo bất thường · {abnormalTarget?.pointName}</DialogTitle>
          </DialogHeader>
          <select
            className="h-10 rounded-md border px-3"
            value={abnormalForm.severity}
            onChange={(e) => setAbnormalForm({ ...abnormalForm, severity: e.target.value })}
          >
            {Object.entries(SEVERITY_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                Mức độ: {v}
              </option>
            ))}
          </select>
          <Textarea
            placeholder="Mô tả bất thường..."
            value={abnormalForm.note}
            onChange={(e) => setAbnormalForm({ ...abnormalForm, note: e.target.value })}
          />
          <Button
            variant="destructive"
            disabled={!abnormalForm.note.trim() || checkMutation.isPending}
            onClick={() =>
              abnormalTarget &&
              submitCheck(abnormalTarget.checkId, "ABNORMAL", {
                severity: abnormalForm.severity,
                note: abnormalForm.note.trim(),
              })
            }
          >
            Ghi nhận bất thường
          </Button>
        </DialogContent>
      </Dialog>

      {/* Shift detail */}
      <Dialog open={!!selectedId} onOpenChange={(o) => !o && setSelectedId(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detail?.shiftNumber} · {detail?.route?.name}
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{t(`status.${detail.status}`, { defaultValue: t('common:unknownValue') })}</Badge>
                {["SCHEDULED", "OVERDUE"].includes(detail.status) && (
                  <>
                    <Button size="sm" onClick={() => shiftMutation.mutate({ kind: "start", data: detail })}>
                      <Play className="mr-1 h-3 w-3" />
                      Bắt đầu
                    </Button>
                    <select
                      className="h-8 rounded-md border px-2 text-sm"
                      value={detail.assigneeId || ""}
                      onChange={(e) =>
                        shiftMutation.mutate({
                          kind: "reassign",
                          data: { id: detail.id, assigneeId: e.target.value },
                        })
                      }
                    >
                      <option value="">Chưa phân công</option>
                      {patrolUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.fullName}
                        </option>
                      ))}
                    </select>
                  </>
                )}
                {detail.status === "IN_PROGRESS" && (
                  <Button size="sm" onClick={() => shiftMutation.mutate({ kind: "complete", data: detail })}>
                    Hoàn thành ca
                  </Button>
                )}
                {detail.cancelReason && (
                  <span className="text-sm text-muted-foreground">
                    Lý do hủy: {detail.cancelReason}
                  </span>
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
                        <div className="text-sm text-muted-foreground">{c.point.location}</div>
                        {c.tooFast && (
                          <div className="text-xs text-destructive">
                            ⚠ Kiểm tra quá nhanh so với điểm trước
                          </div>
                        )}
                        {c.locationVerified === false && (
                          <div className="text-xs text-destructive">
                            ⚠ Vị trí kiểm tra lệch khỏi điểm ({Math.round(c.distanceMeters)}m)
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge
                          variant={
                            c.result === "ABNORMAL"
                              ? "destructive"
                              : c.result === "NORMAL"
                                ? "default"
                                : "secondary"
                          }
                        >
                          {t(`result.${c.result}`, { defaultValue: t('common:unknownValue') })}
                          {c.severity ? ` · ${t(`severity.${c.severity}`, { defaultValue: SEVERITY_LABEL[c.severity] || c.severity })}` : ""}
                        </Badge>
                      </div>
                    </div>
                    {detail.status === "IN_PROGRESS" && c.result === "PENDING" && (
                      <div className="mt-3 space-y-2">
                        {c.point.requireQrScan && (
                          <Input
                            placeholder="Nhập mã xác thực điểm"
                            value={qrInputs[c.id] || ""}
                            onChange={(e) =>
                              setQrInputs({ ...qrInputs, [c.id]: e.target.value })
                            }
                          />
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => submitCheck(c.id, "NORMAL")}
                          >
                            Bình thường
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() =>
                              setAbnormalTarget({ checkId: c.id, pointName: c.point.name })
                            }
                          >
                            Bất thường
                          </Button>
                          <label className="inline-flex cursor-pointer items-center rounded-md border px-3 text-sm">
                            <Upload className="mr-1 h-3 w-3" />
                            Minh chứng
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) =>
                                e.target.files?.[0] &&
                                checkMutation.mutate({
                                  kind: "evidence",
                                  data: { id: c.id, file: e.target.files[0] },
                                })
                              }
                            />
                          </label>
                        </div>
                      </div>
                    )}
                    {c.filePath && (
                      <div className="mt-2 block w-32 overflow-hidden rounded-md border">
                        <AuthenticatedImage
                          src={`/files/patrol-checks/${c.id}`}
                          className="h-20 w-32 object-cover"
                          alt="Minh chứng"
                        />
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
