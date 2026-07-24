import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Boxes,
  History,
  PackagePlus,
  Plus,
  Search,
  Warehouse,
} from "lucide-react";
import { inventoryApi, spacesApi } from "@/api";
import { useMallStore } from "@/store/mall.store";
import { useAuthStore } from "@/store/auth.store";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TYPES: Record<string, string> = {
  VTTH: "Vật tư tiêu hao",
  CCDC: "Công cụ dụng cụ",
  EQUIPMENT: "Trang thiết bị vận hành",
};
const TX_TYPES: Record<string, string> = {
  IN: "Nhập kho",
  OUT: "Xuất kho",
  RETURN: "Hoàn trả",
  ADJUST: "Kiểm kê/điều chỉnh",
};
const emptyCategory = { code: "", name: "", itemType: "VTTH", description: "" };
const emptyItem = {
  sku: "",
  name: "",
  itemType: "VTTH",
  categoryId: "",
  unit: "Cái",
  specification: "",
  manufacturer: "",
  location: "",
  minStock: 0,
  notes: "",
};
const emptyTx = {
  itemId: "",
  type: "IN",
  quantity: 1,
  unitCost: 0,
  supplier: "",
  recipient: "",
  department: "",
  referenceNo: "",
  purpose: "",
  notes: "",
};
const money = (n: number) =>
  new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(n || 0);
const errorText = (e: any) =>
  e?.response?.data?.message || e?.message || "Có lỗi xảy ra";

export default function InventoryPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();
  const selectedMallId = useMallStore((s) => s.selectedMallId);
  const [mallId, setMallId] = useState(selectedMallId || "");
  const [type, setType] = useState("");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<
    "category" | "item" | "transaction" | null
  >(null);
  const [categoryForm, setCategoryForm] = useState<any>(emptyCategory);
  const [itemForm, setItemForm] = useState<any>(emptyItem);
  const [txForm, setTxForm] = useState<any>(emptyTx);
  const canEdit = ["ADMIN", "MALL_DIRECTOR", "OPERATION"].includes(
    user?.role || "",
  );
  const mallsQ = useQuery({
    queryKey: ["malls"],
    queryFn: spacesApi.listMalls,
  });
  const categoriesQ = useQuery({
    queryKey: ["inventory-categories", mallId],
    queryFn: () => inventoryApi.categories(mallId ? { mallId } : undefined),
  });
  const itemsQ = useQuery({
    queryKey: ["inventory-items", mallId, type, search],
    queryFn: () =>
      inventoryApi.items({
        ...(mallId && { mallId }),
        ...(type && { itemType: type }),
        ...(search && { search }),
        limit: 100,
      }),
  });
  const txQ = useQuery({
    queryKey: ["inventory-transactions", mallId],
    queryFn: () =>
      inventoryApi.transactions({ ...(mallId && { mallId }), limit: 100 }),
  });
  const summaryQ = useQuery({
    queryKey: ["inventory-summary", mallId],
    queryFn: () => inventoryApi.summary(mallId || null),
  });
  const malls: any[] = Array.isArray(mallsQ.data)
    ? mallsQ.data
    : (mallsQ.data as any)?.data || [];
  const categories: any[] = Array.isArray(categoriesQ.data)
    ? categoriesQ.data
    : (categoriesQ.data as any)?.data || [];
  const items: any[] = (itemsQ.data as any)?.data || [];
  const transactions: any[] = (txQ.data as any)?.data || [];
  const summary: any = summaryQ.data || {};
  const filteredCategories = useMemo(
    () =>
      categories.filter(
        (c) => !itemForm.itemType || c.itemType === itemForm.itemType,
      ),
    [categories, itemForm.itemType],
  );
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["inventory-items"] });
    qc.invalidateQueries({ queryKey: ["inventory-categories"] });
    qc.invalidateQueries({ queryKey: ["inventory-transactions"] });
    qc.invalidateQueries({ queryKey: ["inventory-summary"] });
  };
  const mutation = useMutation({
    mutationFn: async ({ kind, data }: any) =>
      kind === "category"
        ? inventoryApi.createCategory(data)
        : kind === "item"
          ? inventoryApi.createItem(data)
          : inventoryApi.createTransaction(data),
    onSuccess: () => {
      refresh();
      setModal(null);
      toast({ title: "Đã lưu dữ liệu kho thành công" });
    },
    onError: (e: any) =>
      toast({
        title: "Không thể lưu",
        description: errorText(e),
        variant: "destructive",
      }),
  });
  const requireMall = () => {
    if (!mallId) {
      toast({
        title: "Vui lòng chọn trung tâm thương mại",
        variant: "destructive",
      });
      return false;
    }
    return true;
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Warehouse className="h-7 w-7" />
            Kho vận hành
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Theo dõi nhập – xuất – tồn VTTH, CCDC và trang thiết bị theo từng
            trung tâm thương mại
          </p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  if (requireMall()) setModal("category");
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Danh mục
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  if (requireMall()) setModal("item");
                }}
              >
                <Boxes className="mr-2 h-4 w-4" />
                Mã hàng
              </Button>
              <Button
                onClick={() => {
                  if (requireMall()) setModal("transaction");
                }}
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Nhập / xuất kho
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="flex flex-wrap gap-3 rounded-lg border bg-card p-4">
        <select
          className="h-10 min-w-64 rounded-md border bg-background px-3"
          value={mallId}
          onChange={(e) => setMallId(e.target.value)}
        >
          <option value="">Tất cả trung tâm thương mại</option>
          {malls.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name}
            </option>
          ))}
        </select>
        <select
          className="h-10 rounded-md border bg-background px-3"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="">Tất cả nhóm</option>
          {Object.entries(TYPES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <div className="relative min-w-64 flex-1">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Tìm mã, tên, vị trí kho..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Tổng mã hàng", summary.totalItems || 0, Boxes],
          ["Sắp hết / hết hàng", summary.lowStock || 0, AlertTriangle],
          ["Giá trị tồn kho", money(summary.inventoryValue), Warehouse],
          [
            "VTTH · CCDC · Thiết bị",
            `${summary.byType?.VTTH || 0} · ${summary.byType?.CCDC || 0} · ${summary.byType?.EQUIPMENT || 0}`,
            History,
          ],
        ].map(([label, value, Icon]: any) => (
          <div key={label} className="rounded-lg border bg-card p-4">
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-bold">{value}</div>
          </div>
        ))}
      </div>
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Tồn kho</TabsTrigger>
          <TabsTrigger value="transactions">Sổ nhập xuất</TabsTrigger>
          <TabsTrigger value="categories">Danh mục</TabsTrigger>
        </TabsList>
        <TabsContent value="stock">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {[
                    "Mã hàng",
                    "Tên hàng",
                    "Nhóm",
                    "Danh mục",
                    "ĐVT",
                    "Vị trí",
                    "Tồn hiện tại",
                    "Tồn tối thiểu",
                    "Giá trị tồn",
                  ].map((x) => (
                    <th key={x} className="px-4 py-3 text-left font-medium">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id} className="border-t hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-medium">{i.sku}</td>
                    <td className="px-4 py-3">
                      {i.name}
                      <div className="text-xs text-muted-foreground">
                        {i.specification}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{TYPES[i.itemType]}</Badge>
                    </td>
                    <td className="px-4 py-3">{i.category?.name}</td>
                    <td className="px-4 py-3">{i.unit}</td>
                    <td className="px-4 py-3">{i.location || "—"}</td>
                    <td
                      className={`px-4 py-3 text-lg font-bold ${i.currentStock <= i.minStock ? "text-red-600" : "text-emerald-600"}`}
                    >
                      {i.currentStock}
                    </td>
                    <td className="px-4 py-3">{i.minStock}</td>
                    <td className="px-4 py-3">
                      {money(i.currentStock * i.averageCost)}
                    </td>
                  </tr>
                ))}
                {!items.length && (
                  <tr>
                    <td
                      colSpan={9}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Chưa có mã hàng trong kho
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="transactions">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {[
                    "Số phiếu",
                    "Thời gian",
                    "Loại",
                    "Mã/Tên hàng",
                    "Số lượng",
                    "Tồn trước → sau",
                    "Đối tác/Người nhận",
                    "Bộ phận",
                    "Chứng từ",
                    "Người tạo",
                  ].map((x) => (
                    <th key={x} className="px-4 py-3 text-left font-medium">
                      {x}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t">
                    <td className="px-4 py-3 font-mono text-xs">
                      {t.transactionNo}
                    </td>
                    <td className="px-4 py-3">
                      {new Date(t.transactionAt).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge>{TX_TYPES[t.type]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <b>{t.item?.sku}</b>
                      <div>{t.item?.name}</div>
                    </td>
                    <td className="px-4 py-3 font-bold">
                      {t.quantity} {t.item?.unit}
                    </td>
                    <td className="px-4 py-3">
                      {t.stockBefore} → {t.stockAfter}
                    </td>
                    <td className="px-4 py-3">
                      {t.supplier || t.recipient || "—"}
                    </td>
                    <td className="px-4 py-3">{t.department || "—"}</td>
                    <td className="px-4 py-3">{t.referenceNo || "—"}</td>
                    <td className="px-4 py-3">{t.createdBy?.fullName}</td>
                  </tr>
                ))}
                {!transactions.length && (
                  <tr>
                    <td
                      colSpan={10}
                      className="p-10 text-center text-muted-foreground"
                    >
                      Chưa có giao dịch kho
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
        <TabsContent value="categories">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <div key={c.id} className="rounded-lg border bg-card p-4">
                <div className="flex justify-between">
                  <div>
                    <span className="font-mono text-sm text-muted-foreground">
                      {c.code}
                    </span>
                    <h3 className="font-semibold">{c.name}</h3>
                  </div>
                  <Badge variant="outline">{TYPES[c.itemType]}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {c.description || "Không có mô tả"}
                </p>
                <p className="mt-3 text-xs">{c._count?.items || 0} mã hàng</p>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>
      <Dialog open={!!modal} onOpenChange={(open) => !open && setModal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modal === "category"
                ? "Thêm danh mục kho"
                : modal === "item"
                  ? "Thêm mã vật tư / công cụ / thiết bị"
                  : "Lập phiếu nhập – xuất kho"}
            </DialogTitle>
          </DialogHeader>
          {modal === "category" && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  kind: "category",
                  data: { ...categoryForm, mallId },
                });
              }}
            >
              <Field label="Mã danh mục">
                <Input
                  required
                  value={categoryForm.code}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, code: e.target.value })
                  }
                />
              </Field>
              <Field label="Tên danh mục">
                <Input
                  required
                  value={categoryForm.name}
                  onChange={(e) =>
                    setCategoryForm({ ...categoryForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Nhóm">
                <TypeSelect
                  value={categoryForm.itemType}
                  onChange={(v: string) =>
                    setCategoryForm({ ...categoryForm, itemType: v })
                  }
                />
              </Field>
              <Field label="Mô tả">
                <Input
                  value={categoryForm.description}
                  onChange={(e) =>
                    setCategoryForm({
                      ...categoryForm,
                      description: e.target.value,
                    })
                  }
                />
              </Field>
              <Submit loading={mutation.isPending} />
            </form>
          )}
          {modal === "item" && (
            <form
              className="grid grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  kind: "item",
                  data: {
                    ...itemForm,
                    mallId,
                    minStock: Number(itemForm.minStock),
                  },
                });
              }}
            >
              <Field label="Nhóm">
                <TypeSelect
                  value={itemForm.itemType}
                  onChange={(v: string) =>
                    setItemForm({ ...itemForm, itemType: v, categoryId: "" })
                  }
                />
              </Field>
              <Field label="Danh mục">
                <select
                  required
                  className="h-10 w-full rounded-md border px-3"
                  value={itemForm.categoryId}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, categoryId: e.target.value })
                  }
                >
                  <option value="">Chọn danh mục</option>
                  {filteredCategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mã hàng (SKU)">
                <Input
                  required
                  value={itemForm.sku}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, sku: e.target.value })
                  }
                />
              </Field>
              <Field label="Tên hàng">
                <Input
                  required
                  value={itemForm.name}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, name: e.target.value })
                  }
                />
              </Field>
              <Field label="Đơn vị tính">
                <Input
                  required
                  value={itemForm.unit}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, unit: e.target.value })
                  }
                />
              </Field>
              <Field label="Tồn tối thiểu">
                <Input
                  type="number"
                  min="0"
                  value={itemForm.minStock}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, minStock: e.target.value })
                  }
                />
              </Field>
              <Field label="Quy cách">
                <Input
                  value={itemForm.specification}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, specification: e.target.value })
                  }
                />
              </Field>
              <Field label="Nhà sản xuất">
                <Input
                  value={itemForm.manufacturer}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, manufacturer: e.target.value })
                  }
                />
              </Field>
              <Field label="Vị trí kho">
                <Input
                  value={itemForm.location}
                  onChange={(e) =>
                    setItemForm({ ...itemForm, location: e.target.value })
                  }
                />
              </Field>
              <div className="col-span-2">
                <Submit loading={mutation.isPending} />
              </div>
            </form>
          )}
          {modal === "transaction" && (
            <form
              className="grid grid-cols-2 gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                mutation.mutate({
                  kind: "transaction",
                  data: {
                    ...txForm,
                    quantity: Number(txForm.quantity),
                    unitCost: Number(txForm.unitCost) || undefined,
                  },
                });
              }}
            >
              <div className="col-span-2">
                <Field label="Mã hàng">
                  <select
                    required
                    className="h-10 w-full rounded-md border px-3"
                    value={txForm.itemId}
                    onChange={(e) =>
                      setTxForm({ ...txForm, itemId: e.target.value })
                    }
                  >
                    <option value="">Chọn mã hàng</option>
                    {items.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.sku} — {i.name} (tồn {i.currentStock} {i.unit})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Loại giao dịch">
                <select
                  className="h-10 w-full rounded-md border px-3"
                  value={txForm.type}
                  onChange={(e) =>
                    setTxForm({ ...txForm, type: e.target.value })
                  }
                >
                  {Object.entries(TX_TYPES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  txForm.type === "ADJUST"
                    ? "Tồn thực tế sau kiểm kê"
                    : "Số lượng"
                }
              >
                <Input
                  required
                  type="number"
                  min="0.0001"
                  step="any"
                  value={txForm.quantity}
                  onChange={(e) =>
                    setTxForm({ ...txForm, quantity: e.target.value })
                  }
                />
              </Field>
              <Field label="Đơn giá nhập">
                <Input
                  type="number"
                  min="0"
                  value={txForm.unitCost}
                  onChange={(e) =>
                    setTxForm({ ...txForm, unitCost: e.target.value })
                  }
                />
              </Field>
              <Field label="Số chứng từ">
                <Input
                  value={txForm.referenceNo}
                  onChange={(e) =>
                    setTxForm({ ...txForm, referenceNo: e.target.value })
                  }
                />
              </Field>
              <Field label="Nhà cung cấp">
                <Input
                  value={txForm.supplier}
                  onChange={(e) =>
                    setTxForm({ ...txForm, supplier: e.target.value })
                  }
                />
              </Field>
              <Field label="Người nhận">
                <Input
                  value={txForm.recipient}
                  onChange={(e) =>
                    setTxForm({ ...txForm, recipient: e.target.value })
                  }
                />
              </Field>
              <Field label="Bộ phận">
                <Input
                  value={txForm.department}
                  onChange={(e) =>
                    setTxForm({ ...txForm, department: e.target.value })
                  }
                />
              </Field>
              <Field label="Mục đích">
                <Input
                  value={txForm.purpose}
                  onChange={(e) =>
                    setTxForm({ ...txForm, purpose: e.target.value })
                  }
                />
              </Field>
              <div className="col-span-2">
                <Submit loading={mutation.isPending} />
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: any) {
  return (
    <label className="grid gap-1.5 text-sm font-medium">
      <span>{label}</span>
      {children}
    </label>
  );
}
function TypeSelect({ value, onChange }: any) {
  return (
    <select
      className="h-10 w-full rounded-md border px-3"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {Object.entries(TYPES).map(([k, v]) => (
        <option key={k} value={k}>
          {v}
        </option>
      ))}
    </select>
  );
}
function Submit({ loading }: any) {
  return (
    <Button className="w-full" disabled={loading} type="submit">
      {loading ? "Đang lưu..." : "Lưu dữ liệu"}
    </Button>
  );
}
