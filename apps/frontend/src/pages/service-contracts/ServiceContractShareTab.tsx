import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trash2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { serviceContractsApi } from "@/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { SERVICE_CONTRACT_EDIT_ROLES } from "@/lib/permissions";
import type { AppRole } from "@/lib/permissions";

export type SharePermission = "READ" | "EDIT" | "DELETE";

export interface ShareEntry {
  userId: string;
  permission: SharePermission;
  fullName: string;
  email: string;
  role: AppRole;
}

interface ShareableUser {
  id: string;
  fullName: string;
  email: string;
  role: AppRole;
}

const PERMISSIONS: SharePermission[] = ["READ", "EDIT", "DELETE"];
const PERMISSION_KEYS: Record<SharePermission, { label: string; hint: string }> = {
  READ: { label: "shareRead", hint: "shareReadHint" },
  EDIT: { label: "shareEdit", hint: "shareEditHint" },
  DELETE: { label: "shareDelete", hint: "shareDeleteHint" },
};

interface Props {
  mallId: string;
  value: ShareEntry[];
  onChange: (next: ShareEntry[]) => void;
  /** Không phải người tạo: chỉ được xem danh sách, không cấp/thu hồi được. */
  readOnly?: boolean;
}

/**
 * Tab "Chia sẻ" nằm trong modal tạo/chỉnh sửa hợp đồng dịch vụ. Danh sách được
 * giữ trong state của trang cha và gửi lên cùng một lần bấm Lưu với tab thông
 * tin, nên component này không tự gọi API ghi nào.
 */
export function ServiceContractShareTab({ mallId, value, onChange, readOnly }: Props) {
  const { t } = useTranslation("serviceContracts");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [permission, setPermission] = useState<SharePermission>("READ");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  const users = useQuery({
    queryKey: ["service-contract-shareable-users", mallId, search],
    queryFn: () => serviceContractsApi.shareableUsers(mallId, search),
    enabled: !!mallId && !readOnly,
  });
  const candidates: ShareableUser[] = (users.data as any)?.data ?? users.data ?? [];

  // Người đã có trong danh sách thì không hiện lại trong ô chọn — muốn đổi mức
  // quyền thì sửa ngay trên dòng của họ ở bảng bên dưới.
  const alreadyShared = new Set(value.map((entry) => entry.userId));
  const options = candidates
    .filter((user) => !alreadyShared.has(user.id))
    .map((user) => ({
      value: user.id,
      label: `${user.fullName} - ${user.email}`,
      hint: user.role,
    }));

  function add() {
    if (!selectedUserId) {
      setError(t("shareSelectFirst"));
      return;
    }
    const user = candidates.find((candidate) => candidate.id === selectedUserId);
    if (!user) return;
    setError("");
    onChange([...value, { userId: user.id, permission, fullName: user.fullName, email: user.email, role: user.role }]);
    setSelectedUserId("");
    setPermission("READ");
  }

  function setEntryPermission(userId: string, next: SharePermission) {
    onChange(value.map((entry) => (entry.userId === userId ? { ...entry, permission: next } : entry)));
  }

  if (readOnly) {
    // Người được chia sẻ vẫn thấy ai đang có quyền trên hồ sơ này — hữu ích khi
    // phối hợp — nhưng không có ô chọn, nút thêm hay nút gỡ.
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {t("shareOnlyCreator")}
        </p>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            {t("shareListTitle")} ({value.length})
          </h4>
          {value.length === 0 && (
            <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("shareEmpty")}</p>
          )}
          {value.map((entry) => (
            <div key={entry.userId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <p className="min-w-0 flex-1 truncate text-sm">
                {entry.fullName} - {entry.email}
              </p>
              <Badge variant="outline">{entry.role}</Badge>
              <Badge>{t(PERMISSION_KEYS[entry.permission].label)}</Badge>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!mallId) {
    return <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">{t("shareSelectMallFirst")}</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{t("shareTitle")}</h3>
        <p className="text-sm text-muted-foreground">{t("shareIntro")}</p>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <label className="block text-sm font-medium" htmlFor="service-contract-share-user">
          {t("sharePerson")}
        </label>
        <SearchableSelect
          id="service-contract-share-user"
          value={selectedUserId}
          options={options}
          onChange={(next) => {
            setSelectedUserId(next);
            setError("");
          }}
          onSearchChange={setSearch}
          placeholder={t("sharePersonPlaceholder")}
          searchPlaceholder={t("shareSearchPlaceholder")}
          emptyText={t("shareNoUsers")}
          loading={users.isLoading}
        />

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("sharePermission")}</legend>
          {PERMISSIONS.map((level) => (
            <label key={level} className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                // `name` cố ý không trùng field nào của hợp đồng: danh sách chia
                // sẻ đi qua state chứ không qua FormData của form cha.
                name="serviceContractSharePermission"
                className="mt-1"
                checked={permission === level}
                onChange={() => setPermission(level)}
              />
              <span>
                <span className="font-medium">{t(PERMISSION_KEYS[level].label)}</span>
                <span className="block text-xs text-muted-foreground">{t(PERMISSION_KEYS[level].hint)}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="button" variant="outline" onClick={add} disabled={!selectedUserId}>
          <UserPlus size={16} className="mr-2" />
          {t("shareAdd")}
        </Button>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">
          {t("shareListTitle")} ({value.length})
        </h4>
        {value.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">{t("shareEmpty")}</p>
        )}
        {value.map((entry) => {
          // Vai trò quyết định trần quyền: cấp cao hơn cho người không có vai
          // trò sửa sẽ không có tác dụng, nên nói thẳng ra thay vì để họ tưởng đã cấp.
          const capped = !SERVICE_CONTRACT_EDIT_ROLES.includes(entry.role) && entry.permission !== "READ";
          return (
            <div key={entry.userId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {entry.fullName} - {entry.email}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{entry.role}</Badge>
                  {capped && <span className="text-xs text-amber-700">{t("shareRoleCapped")}</span>}
                </div>
              </div>
              <select
                value={entry.permission}
                onChange={(event) => setEntryPermission(entry.userId, event.target.value as SharePermission)}
                className="h-9 rounded-md border bg-background px-2 text-sm"
                aria-label={`${t("sharePermission")} - ${entry.fullName}`}
              >
                {PERMISSIONS.map((level) => (
                  <option key={level} value={level}>
                    {t(PERMISSION_KEYS[level].label)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                aria-label={`${t("shareRemove")} ${entry.fullName}`}
                title={t("shareRemove")}
                onClick={() => onChange(value.filter((other) => other.userId !== entry.userId))}
                className="text-muted-foreground hover:text-red-600"
              >
                <Trash2 size={16} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
