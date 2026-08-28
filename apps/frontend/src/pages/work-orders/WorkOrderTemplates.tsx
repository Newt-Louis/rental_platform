import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
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
import { SearchableSelect } from "@/components/ui/searchable-select";

const FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "ANNUALLY"] as const;
const CATEGORIES = ["TECHNICAL", "CLEANING", "SECURITY", "LANDSCAPE", "FACILITY", "OTHER"] as const;
// These are persisted department values, not presentation labels. Keep them
// stable when the UI locale changes.
const DEFAULT_DEPARTMENTS = ["Kỹ thuật", "Vệ sinh", "An ninh", "Cảnh quan", "Cơ sở vật chất"];
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

export default function WorkOrderTemplates({ mallId, mallName, users, departmentOptions = [] }: any) {
  const { t, i18n } = useTranslation("workOrders");
  const qc = useQueryClient(),
    { toast } = useToast();
  const [expanded, setExpanded] = useState(false),
    [open, setOpen] = useState(false),
    [form, setForm] = useState<any>(blank);
  const departmentNames: string[] = departmentOptions.map((department: any) => department.name);
  const departments = Array.from(
    new Set(
      departmentNames.length
        ? departmentNames
        : [...DEFAULT_DEPARTMENTS, ...users.map((user: any) => user.departmentInfo?.name).filter(Boolean)],
    ),
  ).sort((a, b) => a.localeCompare(b, "vi"));
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
            ? t("templates.toast.alreadyCreated")
            : t("templates.toast.updated"),
      });
    },
    onError: (e: any) =>
      toast({
        title: t("templates.toast.updateFailed"),
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
        title: t("templates.toast.required"),
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
          {t("templates.title")}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            {expanded ? t("templates.collapse") : t("templates.expand")}
          </span>
        </button>
        <Button
          size="sm"
          onClick={() => {
            if (!mallId) {
              toast({ title: t("templates.toast.selectMall"), variant: "destructive" });
              return;
            }
            setForm({ ...blank, mallId });
            setOpen(true);
            setExpanded(true);
          }}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t("templates.create")}
        </Button>
      </div>
      {expanded && (
        <div className="border-t p-4">
          {query.isLoading ? (
            <p>{t("templates.loading")}</p>
          ) : !rows.length ? (
            <p className="text-sm text-muted-foreground">
              {t("templates.empty")}
            </p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-md border p-4">
                  <div className="flex justify-between gap-3">
                    <div>
                      <div className="font-semibold">{row.name}</div>
                      <div className="text-sm text-muted-foreground">
                        {row.mall?.name} · {t(`category.${row.category}`, { defaultValue: row.category })}
                      </div>
                    </div>
                    <Badge variant={row.isActive ? "default" : "secondary"}>
                      {row.isActive ? t("templates.active") : t("templates.paused")}
                    </Badge>
                  </div>
                  <div className="mt-3 text-sm">
                    <div>{row.title}</div>
                    <div className="text-muted-foreground">
                      {t(`templates.frequency.${row.frequency}`, { defaultValue: row.frequency })} · {t("templates.nextRun")}: {" "}
                      {new Date(row.nextRunAt).toLocaleString(i18n.language)} · SLA{" "}
                      {t("templates.hours", { count: row.dueHours })}
                    </div>
                    <div className="text-muted-foreground">
                      {t("templates.generated", { count: row._count?.workOrders || 0 })}
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
                      {t("templates.runNow")}
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
                      {row.isActive ? t("templates.pause") : t("templates.activate")}
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
            <DialogTitle>{t("templates.dialogTitle")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              {t("templates.mall")} *
              <span className="mt-1 flex h-10 w-full items-center rounded-md border bg-muted/40 px-3">
                {mallName}
              </span>
            </label>
            <label className="text-sm">
              {t("templates.name")} *
              <Input
                className="mt-1"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className="text-sm">
              {t("templates.category")}
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {t(`category.${category}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              {t("templates.frequencyLabel")}
              <select
                className="mt-1 h-10 w-full rounded-md border px-3"
                value={form.frequency}
                onChange={(e) =>
                  setForm({ ...form, frequency: e.target.value })
                }
              >
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {t(`templates.frequency.${frequency}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm sm:col-span-2">
              {t("templates.workOrderTitle")} *
              <Input
                className="mt-1"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </label>
            <label className="text-sm">
              {t("templates.nextRunAt")} *
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
              {t("templates.slaHours")}
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
              {t("templates.department")}
              <SearchableSelect
                className="mt-1"
                value={form.assignedDepartment}
                options={departments.map((name) => ({ value: name, label: name }))}
                placeholder={t("templates.selectDepartment")}
                searchPlaceholder={t("templates.searchDepartment")}
                emptyText={t("templates.noDepartment")}
                clearLabel={t("templates.selectDepartment")}
                onChange={(value) =>
                  setForm({ ...form, assignedDepartment: value, assigneeId: "" })
                }
              />
            </label>
            <label className="text-sm">
              {t("templates.assignee")}
              <SearchableSelect
                className="mt-1"
                value={form.assigneeId}
                options={users
                  .filter((user: any) =>
                    !form.assignedDepartment ||
                    user.departmentInfo?.name === form.assignedDepartment,
                  )
                  .map((user: any) => ({
                    value: user.id,
                    label: user.fullName,
                    hint: user.departmentInfo?.name,
                  }))}
                placeholder={t("table.unassigned")}
                searchPlaceholder={t("templates.searchAssignee")}
                emptyText={t("templates.noAssignee")}
                clearLabel={t("table.unassigned")}
                onChange={(value) => {
                  const assignee = users.find((user: any) => user.id === value);
                  setForm({
                    ...form,
                    assigneeId: value,
                    assignedDepartment:
                      assignee?.departmentInfo?.name || form.assignedDepartment,
                  });
                }}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("templates.location")}
              <Input
                className="mt-1"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </label>
            <label className="text-sm sm:col-span-2">
              {t("templates.checklist")}
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
            {action.isPending ? t("templates.saving") : t("templates.save")}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
