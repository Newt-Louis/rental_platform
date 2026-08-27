import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { departmentsApi } from "@/api";
import type { Department } from "@/types";
import { useAuthStore } from "@/store/auth.store";
import { useMallStore } from "@/store/mall.store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { useToast } from "@/components/ui/use-toast";
import { ERPToolbar } from "@/components/erp";

interface MallOption {
  id: string;
  name: string;
  code?: string;
}

interface DepartmentDialogProps {
  open: boolean;
  department: Department | null;
  initialMallId: string;
  malls: MallOption[];
  isAdmin: boolean;
  onClose: () => void;
}

function DepartmentDialog({
  open,
  department,
  initialMallId,
  malls,
  isAdmin,
  onClose,
}: DepartmentDialogProps) {
  const { t } = useTranslation("departments");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEdit = Boolean(department);
  const [mallId, setMallId] = useState("");
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("none");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setMallId(department?.mallId ?? initialMallId);
    setName(department?.name ?? "");
    setParentId(department?.parentId ?? "none");
    setDescription(department?.description ?? "");
  }, [department, initialMallId, open]);

  const { data: parentData, isLoading: parentsLoading } = useQuery({
    queryKey: ["departments", "options", mallId],
    queryFn: () => departmentsApi.options(mallId),
    enabled: open && Boolean(mallId),
  });
  const parentOptions: Department[] = (parentData ?? []).filter(
    (candidate: Department) => candidate.id !== department?.id,
  );

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name,
        parentId: parentId === "none" ? null : parentId,
        description: description || null,
      };
      return department
        ? departmentsApi.update(department.id, payload)
        : departmentsApi.create({ ...payload, mallId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: t(isEdit ? "toast.updated" : "toast.created") });
      onClose();
    },
    onError: () =>
      toast({ title: t("toast.saveError"), variant: "destructive" }),
  });

  const canSubmit = Boolean(mallId && name.trim()) && !mutation.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {t(isEdit ? "form.editTitle" : "form.createTitle")}
          </DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="department-mall">{t("mall.label")}</Label>
            <select
              id="department-mall"
              value={mallId}
              onChange={(event) => {
                setMallId(event.target.value);
                setParentId("none");
              }}
              disabled={!isAdmin || isEdit}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50"
            >
              <option value="">{t("mall.select")}</option>
              {malls.map((mall) => (
                <option key={mall.id} value={mall.id}>
                  {mall.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="department-name">{t("form.name")}</Label>
            <Input
              id="department-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("form.namePlaceholder")}
              maxLength={200}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="department-parent">{t("form.parent")}</Label>
            <select
              id="department-parent"
              value={parentId}
              onChange={(event) => setParentId(event.target.value)}
              disabled={!mallId || parentsLoading}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-gray-50"
            >
              <option value="none">{t("form.noParent")}</option>
              {parentOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="department-description">
              {t("form.description")}
            </Label>
            <Textarea
              id="department-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder={t("form.descriptionPlaceholder")}
              maxLength={2000}
              rows={4}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {mutation.isPending ? t("form.saving") : t("actions.save")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DepartmentsTab() {
  const { t } = useTranslation("departments");
  const { user } = useAuthStore();
  const activeMallId = useMallStore((state) => state.selectedMallId);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const [selectedMallId, setSelectedMallId] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [deleting, setDeleting] = useState<Department | null>(null);

  const { data: mallsData } = useQuery({
    queryKey: ["departments", "malls"],
    queryFn: departmentsApi.malls,
  });
  const malls: MallOption[] = mallsData?.data ?? mallsData ?? [];

  useEffect(() => {
    if (isAdmin) {
      if (selectedMallId && !malls.some((mall) => mall.id === selectedMallId)) {
        setSelectedMallId("");
      }
      return;
    }
    const authorisedActiveMall = malls.find((mall) => mall.id === activeMallId);
    const soleAccessibleMall = malls.length === 1 ? malls[0] : undefined;
    setSelectedMallId(authorisedActiveMall?.id ?? soleAccessibleMall?.id ?? "");
  }, [activeMallId, isAdmin, malls, selectedMallId]);

  useEffect(() => setPage(1), [deferredSearch, selectedMallId]);

  const queryParams = {
    mallId: selectedMallId,
    page,
    limit: 20,
    ...(deferredSearch ? { search: deferredSearch } : {}),
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["departments", "list", queryParams],
    queryFn: () => departmentsApi.list(queryParams),
    enabled: Boolean(selectedMallId),
  });
  const departments: Department[] = data?.data ?? [];
  const total = Number(data?.total ?? 0);
  const totalPages = Math.max(1, Number(data?.totalPages ?? 1));

  const deleteMutation = useMutation({
    mutationFn: (id: string) => departmentsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["departments"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      toast({ title: t("toast.deleted") });
      setDeleting(null);
    },
    onError: (error: any) => {
      const hasChildren = error?.response?.status === 409;
      toast({
        title: t(hasChildren ? "delete.hasChildren" : "toast.deleteError"),
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (department: Department) => {
    setEditing(department);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold text-slate-900">{t("title")}</h2>
        <p className="mt-1 text-sm text-slate-500">{t("description")}</p>
      </div>

      <ERPToolbar>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          <label className="sr-only" htmlFor="department-list-mall">
            {t("mall.label")}
          </label>
          <select
            id="department-list-mall"
            value={selectedMallId}
            onChange={(event) => setSelectedMallId(event.target.value)}
            disabled={!isAdmin}
            title={!isAdmin ? t("mall.locked") : undefined}
            className="h-9 min-w-56 rounded-md border bg-white px-3 text-sm disabled:bg-gray-50"
          >
            <option value="">{t("mall.select")}</option>
            {malls.map((mall) => (
              <option key={mall.id} value={mall.id}>
                {mall.name}
              </option>
            ))}
          </select>
          <div className="relative min-w-56 flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search.placeholder")}
              disabled={!selectedMallId}
              className="h-9 pl-9"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="gap-2"
          onClick={openCreate}
          disabled={!selectedMallId}
        >
          <Plus size={15} /> {t("actions.create")}
        </Button>
      </ERPToolbar>

      {!selectedMallId ? (
        <div className="rounded-lg border border-dashed py-12 text-center text-sm text-gray-500">
          <Building2 size={34} className="mx-auto mb-2 text-gray-300" />
          {isAdmin ? t("mall.required") : t("mall.noAccess")}
        </div>
      ) : isLoading ? (
        <div className="space-y-2" aria-label={t("table.loading")}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          <p className="mb-3 text-sm text-red-700">{t("toast.loadError")}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            {t("actions.retry")}
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    {t("table.name")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    {t("table.parent")}
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    {t("table.description")}
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">
                    {t("table.children")}
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">
                    {t("table.actions")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {departments.map((department) => (
                  <tr key={department.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {department.name}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {department.parent?.name ?? t("table.root")}
                    </td>
                    <td className="max-w-sm truncate px-4 py-3 text-gray-500">
                      {department.description || t("notAvailable")}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600">
                      {department._count?.children ?? 0}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1"
                          onClick={() => openEdit(department)}
                        >
                          <Pencil size={14} /> {t("actions.edit")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-red-600 hover:text-red-700"
                          onClick={() => setDeleting(department)}
                        >
                          <Trash2 size={14} /> {t("actions.delete")}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {departments.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-12 text-center text-gray-400"
                    >
                      {t("table.empty")}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t px-4 py-3 text-sm text-gray-500">
            <span>{t("table.pagination", { total, page, totalPages })}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((value) => value - 1)}
              >
                {t("actions.previous")}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((value) => value + 1)}
              >
                {t("actions.next")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <DepartmentDialog
        open={dialogOpen}
        department={editing}
        initialMallId={selectedMallId}
        malls={malls}
        isAdmin={isAdmin}
        onClose={() => {
          setDialogOpen(false);
          setEditing(null);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title={t("delete.title")}
        description={t("delete.description", { name: deleting?.name ?? "" })}
        confirmLabel={t("delete.confirm")}
        cancelLabel={t("delete.cancel")}
        loadingLabel={t("delete.processing")}
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </div>
  );
}
