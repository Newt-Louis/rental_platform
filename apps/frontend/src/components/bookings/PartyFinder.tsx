import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, User } from "lucide-react";
import { crmApi } from "@/api";
import { AsyncState } from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
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
}

export function PartyFinder({
  mallId,
  selectedLead,
  onSelect,
}: PartyFinderProps) {
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
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-500">
        Chọn Mall trước khi tìm Lead.
      </div>
    );
  }

  return (
    <section aria-labelledby="party-finder-title" className="space-y-3">
      <div>
        <h3 id="party-finder-title" className="font-semibold text-gray-900">
          Chọn Lead
        </h3>
        <p className="text-xs text-gray-500">
          Customer trực tiếp được hoãn; Booking tiếp tục dùng Lead.
        </p>
      </div>
      <div className="relative">
        <Search
          className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
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
          className="pl-9"
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
        <div className="max-h-64 divide-y overflow-y-auto rounded-lg border">
          {leads.map((lead) => {
            const selected = selectedLead?.id === lead.id;
            return (
              <div
                key={lead.id}
                className="grid grid-cols-[minmax(0,1fr)_5rem] items-center gap-3 p-3"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <User
                    className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-gray-900">
                        {lead.brandName || lead.company || "Lead chưa đặt tên"}
                      </span>
                      <Badge variant="outline">{lead.status}</Badge>
                    </div>
                    <p className="text-xs text-gray-600">
                      {lead.contactName || "Chưa có người liên hệ"}
                      {lead.phone ? ` · ${lead.phone}` : ""}
                    </p>
                    {lead.email && (
                      <p className="truncate text-xs text-gray-500">
                        {lead.email}
                      </p>
                    )}
                    {lead.customer && (
                      <p className="text-xs text-gray-500">
                        Customer:{" "}
                        {lead.customer.customerCode || lead.customer.companyName}
                      </p>
                    )}
                    {lead.tenant && (
                      <p className="text-xs text-gray-500">
                        Tenant: {lead.tenant.brandName || lead.tenant.companyName}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={selected ? "default" : "outline"}
                  className="w-20"
                  aria-label={`Chọn Lead ${lead.brandName || lead.company || lead.contactName || lead.id}`}
                  onClick={() => onSelect(lead)}
                >
                  {selected ? "Đã chọn" : "Chọn"}
                </Button>
              </div>
            );
          })}
        </div>
      </AsyncState>

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {query.data?.total ?? 0} Lead · Trang {page}/{totalPages}
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Trước
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
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
