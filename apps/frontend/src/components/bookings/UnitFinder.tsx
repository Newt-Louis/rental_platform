import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { RotateCcw, Search } from "lucide-react";
import { bookingApi, spacesApi } from "@/api";
import type { BookingUnitFinderRow } from "@/api/bookings";
import { ERPStatusBadge } from "@/components/erp";
import { AsyncState } from "@/components/ui/async-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDebouncedValue } from "./useDebouncedValue";

const PAGE_SIZE = 10;
const UNIT_STATUSES = [
  "VACANT",
  "BOOKING",
  "NEGOTIATING",
  "CONTRACTED",
  "UNDER_FITOUT",
  "OCCUPIED",
  "MERGED",
] as const;

interface UnitFinderProps {
  mallId?: string;
  initialUnitId?: string;
  selectedUnit: BookingUnitFinderRow | null;
  onSelect: (unit: BookingUnitFinderRow) => void;
}

export function UnitFinder({
  mallId,
  initialUnitId,
  selectedUnit,
  onSelect,
}: UnitFinderProps) {
  const { t } = useTranslation("bookings");
  const [search, setSearch] = useState("");
  const [floorId, setFloorId] = useState("ALL");
  const [zoneId, setZoneId] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [minArea, setMinArea] = useState("");
  const [maxArea, setMaxArea] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search.trim());
  const debouncedMinArea = useDebouncedValue(minArea);
  const debouncedMaxArea = useDebouncedValue(maxArea);

  useEffect(() => {
    setSearch("");
    setFloorId("ALL");
    setZoneId("ALL");
    setStatus("ALL");
    setMinArea("");
    setMaxArea("");
    setPage(1);
  }, [mallId]);

  const params = useMemo(
    () => ({
      mallId,
      search: debouncedSearch || undefined,
      floorId: floorId === "ALL" ? undefined : floorId,
      zoneId: zoneId === "ALL" ? undefined : zoneId,
      status: status === "ALL" ? undefined : status,
      minArea: debouncedMinArea === "" ? undefined : Number(debouncedMinArea),
      maxArea: debouncedMaxArea === "" ? undefined : Number(debouncedMaxArea),
      page,
      limit: PAGE_SIZE,
    }),
    [
      debouncedMaxArea,
      debouncedMinArea,
      debouncedSearch,
      floorId,
      mallId,
      page,
      status,
      zoneId,
    ],
  );

  const query = useQuery({
    queryKey: ["booking-unit-finder", params],
    queryFn: () => bookingApi.findUnits(params),
    enabled: !!mallId,
  });

  const initialQuery = useQuery({
    queryKey: ["booking-unit-finder-initial", mallId, initialUnitId],
    queryFn: () =>
      bookingApi.findUnits({
        mallId,
        unitId: initialUnitId,
        page: 1,
        limit: 1,
      }),
    enabled: !!mallId && !!initialUnitId && selectedUnit?.id !== initialUnitId,
  });

  useEffect(() => {
    const initialUnit = initialQuery.data?.data?.[0];
    if (initialUnit) onSelect(initialUnit);
  }, [initialQuery.data, onSelect]);

  const floors: any[] =
    useQuery({
      queryKey: ["booking-unit-finder-floors", mallId],
      queryFn: () => spacesApi.listFloors(mallId),
      enabled: !!mallId,
      staleTime: 60_000,
    }).data ?? [];
  const zonesData = useQuery({
    queryKey: ["booking-unit-finder-zones", mallId, floorId],
    queryFn: () =>
      spacesApi.listZones({
        mallId,
        floorId: floorId === "ALL" ? undefined : floorId,
      }),
    enabled: !!mallId,
    staleTime: 60_000,
  }).data;
  const zones: any[] = Array.isArray(zonesData)
    ? zonesData
    : (zonesData?.data ?? []);
  const rows = query.data?.data ?? [];
  const totalPages = query.data?.totalPages ?? 1;

  const resetPage = (action: () => void) => {
    action();
    setPage(1);
  };

  const resetFilters = () => {
    setSearch("");
    setFloorId("ALL");
    setZoneId("ALL");
    setStatus("ALL");
    setMinArea("");
    setMaxArea("");
    setPage(1);
  };

  if (!mallId) {
    return (
      <div className="border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Chọn Mall để tìm mặt bằng.
      </div>
    );
  }

  return (
    <section aria-labelledby="unit-finder-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3
            id="unit-finder-title"
            className="text-base font-semibold text-foreground"
          >
            {t("workspace.unitFinder")}
          </h3>
          <p className="text-xs text-muted-foreground">
            Kết quả và khả năng booking được xác định từ máy chủ.
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {query.data?.total ?? 0} Unit
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-8">
        <div className="relative col-span-2 sm:col-span-3 xl:col-span-2">
          <Search
            className="absolute left-2.5 top-2 h-4 w-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            aria-label="Tìm theo mã hoặc tên Unit"
            value={search}
            onChange={(event) => resetPage(() => setSearch(event.target.value))}
            placeholder="Tìm theo mã hoặc tên Unit..."
            className="h-8 pl-8 text-xs"
          />
        </div>
        <Select
          value={floorId}
          onValueChange={(value) =>
            resetPage(() => {
              setFloorId(value);
              setZoneId("ALL");
            })
          }
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Lọc theo tầng">
            <SelectValue placeholder="Tầng" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả tầng</SelectItem>
            {floors.map((floor) => (
              <SelectItem key={floor.id} value={floor.id}>
                {floor.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={zoneId}
          onValueChange={(value) => resetPage(() => setZoneId(value))}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Lọc theo khu">
            <SelectValue placeholder="Khu" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả khu</SelectItem>
            {zones.map((zone) => (
              <SelectItem key={zone.id} value={zone.id}>
                {zone.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => resetPage(() => setStatus(value))}
        >
          <SelectTrigger
            className="h-8 text-xs"
            aria-label="Lọc theo trạng thái"
          >
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">Tất cả trạng thái</SelectItem>
            {UNIT_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          aria-label="NLA tối thiểu"
          type="number"
          min={0}
          value={minArea}
          onChange={(event) => resetPage(() => setMinArea(event.target.value))}
          placeholder="NLA từ (m²)"
          className="h-8 text-xs"
        />
        <Input
          aria-label="NLA tối đa"
          type="number"
          min={0}
          value={maxArea}
          onChange={(event) => resetPage(() => setMaxArea(event.target.value))}
          placeholder="NLA đến (m²)"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          className="h-8 gap-1.5 px-2 text-xs"
          onClick={resetFilters}
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Đặt lại bộ lọc
        </Button>
      </div>

      <AsyncState
        isLoading={query.isLoading}
        isError={query.isError}
        isEmpty={!query.isLoading && !query.isError && rows.length === 0}
        onRetry={() => query.refetch()}
        emptyTitle="Không tìm thấy mặt bằng"
        emptyDescription="Thử thay đổi từ khóa hoặc bộ lọc."
      >
        <div className="max-h-[min(52vh,560px)] max-w-full overflow-auto border-y border-border">
          <Table className="min-w-[850px]">
            <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm">
              <TableRow>
                <TableHead className="w-[4.5rem]">Chọn</TableHead>
                <TableHead>Unit</TableHead>
                <TableHead>Tầng</TableHead>
                <TableHead>Khu</TableHead>
                <TableHead>Diện tích</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead>Khả năng Booking</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((unit) => {
                const selected = selectedUnit?.id === unit.id;
                return (
                  <TableRow
                    key={unit.id}
                    data-state={selected ? "selected" : undefined}
                    className={unitRowClass(unit, selected)}
                  >
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        className="h-7 w-16 px-2 text-xs"
                        disabled={!unit.currentEligibility.selectable}
                        aria-label={`Chọn Unit ${unit.code}`}
                        aria-describedby={
                          unit.currentEligibility.selectable
                            ? undefined
                            : `unit-blocked-${unit.id}`
                        }
                        onClick={() => onSelect(unit)}
                      >
                        {selected ? "Đã chọn" : "Chọn"}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="font-semibold text-foreground">
                        {unit.code}
                      </div>
                      {unit.name && (
                        <div className="text-xs text-muted-foreground">
                          {unit.name}
                        </div>
                      )}
                      <div className="text-[11px] text-muted-foreground">
                        {unit.mall.name}
                      </div>
                    </TableCell>
                    <TableCell>{unit.floor?.name ?? "—"}</TableCell>
                    <TableCell>{unit.zone?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <div>
                        NLA: {unit.areaNLA?.toLocaleString("vi-VN") ?? "—"} m²
                      </div>
                      <div className="text-xs text-muted-foreground">
                        GFA: {unit.areaGFA?.toLocaleString("vi-VN") ?? "—"} m²
                      </div>
                    </TableCell>
                    <TableCell>
                      <ERPStatusBadge
                        tone={unitStatusTone(unit.status)}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {unitStatusLabel(unit.status, t)}
                      </ERPStatusBadge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <ERPStatusBadge
                          tone={
                            unit.currentEligibility.mode === "IMMEDIATE"
                              ? "success"
                              : unit.currentEligibility.mode === "QUEUE"
                                ? "warning"
                                : "danger"
                          }
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {eligibilityLabel(unit, t)}
                        </ERPStatusBadge>
                        {unit.currentEligibility.mode === "QUEUE" &&
                          unit.currentEligibility.queueCount > 0 && (
                            <div className="text-[11px] tabular-nums text-muted-foreground">
                              {unit.currentEligibility.queueCount} Booking đang
                              chờ
                            </div>
                          )}
                        {!unit.currentEligibility.selectable && (
                          <div
                            id={`unit-blocked-${unit.id}`}
                            className="max-w-44 text-[11px] leading-snug text-muted-foreground"
                          >
                            Không thể chọn vì mặt bằng đang ở trạng thái{" "}
                            {unitStatusLabel(unit.status, t)}.
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </AsyncState>

      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {query.data?.total ?? 0} kết quả · Trang {page}/{totalPages}
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

function eligibilityLabel(
  unit: BookingUnitFinderRow,
  t: (key: string) => string,
) {
  if (unit.currentEligibility.mode === "IMMEDIATE")
    return t("workspace.eligibility.immediate");
  if (unit.currentEligibility.mode === "QUEUE")
    return t("workspace.eligibility.queue");
  return t("workspace.eligibility.blocked");
}

function unitStatusTone(status: string) {
  if (status === "VACANT") return "success" as const;
  if (status === "BOOKING") return "warning" as const;
  if (status === "NEGOTIATING") return "info" as const;
  return "neutral" as const;
}

function unitStatusLabel(
  status: string,
  t: (key: string, options?: { defaultValue?: string }) => string,
) {
  return t(`workspace.unitStatus.${status}`, { defaultValue: t('common:unknownValue') });
}

function unitRowClass(unit: BookingUnitFinderRow, selected: boolean) {
  if (selected) return "bg-blue-50/80 hover:bg-blue-50 dark:bg-blue-950/20";
  if (unit.currentEligibility.mode === "IMMEDIATE")
    return "bg-emerald-50/30 dark:bg-emerald-950/10";
  if (unit.currentEligibility.mode === "QUEUE")
    return "bg-amber-50/30 dark:bg-amber-950/10";
  return "text-muted-foreground opacity-75";
}
