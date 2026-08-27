import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { crmApi } from "@/api";
import { ERPStatusBadge } from "@/components/erp";
import { AsyncState } from "@/components/ui/async-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedValue } from "./useDebouncedValue";

const PAGE_SIZE = 10;

export interface BookingLead {
  id: string;
  mallId?: string | null;
  brandName?: string | null;
  company?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  expectedArea?: number | null;
  notes?: string | null;
  assignedToId?: string | null;
  assignedTo?: {
    id: string;
    fullName?: string | null;
  } | null;
  customer?: {
    id: string;
    customerCode?: string | null;
    companyName?: string | null;
  } | null;
  tenant?: {
    id: string;
    brandName?: string | null;
    companyName?: string | null;
  } | null;
}

interface PartyFinderProps {
  mallId?: string;
  selectedLead: BookingLead | null;
  onSelect: (lead: BookingLead) => void;
  onClear?: () => void;
}

export function PartyFinder({
  mallId,
  selectedLead,
  onSelect,
  onClear,
}: PartyFinderProps) {
  const { t } = useTranslation("bookings");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());
  const query = useQuery({
    queryKey: ["booking-party-finder", mallId, debouncedSearch, page],
    queryFn: () =>
      crmApi.listLeads({
        mallId,
        leaseTermType: "LONG",
        search: debouncedSearch || undefined,
        page,
        limit: PAGE_SIZE,
      }),
    enabled: !!mallId,
  });
  // The API applies the authoritative direct-Mall filter. Keep this defensive
  // projection so a stale/mixed response never renders an unusable option.
  const leads: BookingLead[] = (query.data?.data ?? []).filter(
    (lead: BookingLead) => lead.mallId === mallId,
  );
  const totalPages = query.data?.totalPages ?? 1;

  if (!mallId) {
    return (
      <div className="border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
        Chọn Mall trước khi tìm Lead.
      </div>
    );
  }

  if (selectedLead) {
    return (
      <section aria-labelledby="party-finder-title" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p
              id="party-finder-title"
              className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t("workspace.selectedCustomer")}
            </p>
            <p className="truncate text-sm font-semibold text-foreground">
              {selectedLead.brandName ||
                selectedLead.company ||
                "Lead chưa đặt tên"}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {selectedLead.contactName || "Chưa có người liên hệ"}
              {selectedLead.phone ? ` · ${selectedLead.phone}` : ""}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 shrink-0 px-2 text-xs"
            onClick={onClear}
          >
            {t("workspace.change")}
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="party-finder-title" className="space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3
            id="party-finder-title"
            className="text-sm font-semibold text-foreground"
          >
            Chọn Lead
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tìm trong Mall hiện tại · Lead dài hạn
          </p>
        </div>
      </div>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          aria-label="Tìm Lead"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
          placeholder="Tên thương hiệu, liên hệ, công ty hoặc email..."
          className="h-8 pl-8 text-xs"
        />
      </div>

      <AsyncState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && leads.length === 0}
        onRetry={() => query.refetch()}
        emptyTitle="Không tìm thấy Lead"
        emptyDescription="Thử từ khóa khác trong Mall đã chọn."
      >
        <div className="max-h-56 divide-y divide-border overflow-y-auto border-y border-border">
          {leads.map((lead) => {
            return (
              <div
                key={lead.id}
                className="grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-2 px-2 py-2.5 transition-colors hover:bg-muted/50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {lead.brandName || lead.company || "Lead chưa đặt tên"}
                    </span>
                    <ERPStatusBadge
                      tone="neutral"
                      className="px-1.5 py-0 text-[10px]"
                    >
                      {lead.status}
                    </ERPStatusBadge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {lead.contactName || "Chưa có người liên hệ"}
                    {lead.phone ? ` · ${lead.phone}` : ""}
                  </p>
                  {lead.email && (
                    <p className="truncate text-[11px] text-muted-foreground">
                      {lead.email}
                    </p>
                  )}
                  {lead.customer && (
                    <p className="text-[11px] text-muted-foreground">
                      Customer:{" "}
                      {lead.customer.customerCode || lead.customer.companyName}
                    </p>
                  )}
                  {lead.tenant && (
                    <p className="text-[11px] text-muted-foreground">
                      Tenant: {lead.tenant.brandName || lead.tenant.companyName}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 w-[4.5rem] px-2 text-xs"
                  aria-label={`Chọn Lead ${lead.brandName || lead.company || lead.contactName || lead.id}`}
                  onClick={() => onSelect(lead)}
                >
                  Chọn
                </Button>
              </div>
            );
          })}
        </div>
      </AsyncState>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {query.data?.total ?? 0} Lead · Trang {page}/{totalPages}
        </span>
        <div className="flex gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Trước
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={page >= totalPages || query.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            Sau
          </Button>
        </div>
      </div>
    </section>
  );
}
