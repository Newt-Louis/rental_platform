import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RotateCcw, Search } from "lucide-react";
import { bookingApi, spacesApi } from "@/api";
import type { BookingUnitFinderRow } from "@/api/bookings";
import { AsyncState } from "@/components/ui/async-state";
import { Badge } from "@/components/ui/badge";
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
      minArea:
        debouncedMinArea === "" ? undefined : Number(debouncedMinArea),
      maxArea:
        debouncedMaxArea === "" ? undefined : Number(debouncedMaxArea),
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
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-gray-500">
        Chọn Mall để tìm mặt bằng.
      </div>
    );
  }

  return (
    <section aria-labelledby="unit-finder-title" className="space-y-3">
      <div>
        <h3 id="unit-finder-title" className="font-semibold text-gray-900">
          Tìm mặt bằng
        </h3>
        <p className="text-xs text-gray-500">
          Kết quả và khả năng booking được xác định từ máy chủ.
        </p>
      </div>

      <div className="relative">
        <Search
          className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
          aria-hidden="true"
        />
        <Input
          aria-label="Tìm theo mã hoặc tên Unit"
          value={search}
          onChange={(event) => resetPage(() => setSearch(event.target.value))}
          placeholder="Tìm theo mã hoặc tên Unit..."
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
        <Select
          value={floorId}
          onValueChange={(value) =>
            resetPage(() => {
              setFloorId(value);
              setZoneId("ALL");
            })
          }
        >
          <SelectTrigger aria-label="Lọc theo tầng">
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
          <SelectTrigger aria-label="Lọc theo khu">
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
          <SelectTrigger aria-label="Lọc theo trạng thái">
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
        />
        <Input
          aria-label="NLA tối đa"
          type="number"
          min={0}
          value={maxArea}
          onChange={(event) => resetPage(() => setMaxArea(event.target.value))}
          placeholder="NLA đến (m²)"
        />
        <Button
          type="button"
          variant="outline"
          className="gap-2"
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
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">Chọn</TableHead>
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
                  >
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant={selected ? "default" : "outline"}
                        className="w-20"
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
                      <div className="font-medium text-gray-900">
                        {unit.code}
                      </div>
                      {unit.name && (
                        <div className="text-xs text-gray-500">{unit.name}</div>
                      )}
                      <div className="text-xs text-gray-400">
                        {unit.mall.name}
                      </div>
                    </TableCell>
                    <TableCell>{unit.floor?.name ?? "—"}</TableCell>
                    <TableCell>{unit.zone?.name ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      <div>
                        NLA: {unit.areaNLA?.toLocaleString("vi-VN") ?? "—"} m²
                      </div>
                      <div className="text-xs text-gray-500">
                        GFA: {unit.areaGFA?.toLocaleString("vi-VN") ?? "—"} m²
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{unit.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <Badge
                          variant={
                            unit.currentEligibility.mode === "IMMEDIATE"
                              ? "success"
                              : unit.currentEligibility.mode === "QUEUE"
                                ? "warning"
                                : "slate"
                          }
                        >
                          {eligibilityLabel(unit)}
                        </Badge>
                        {!unit.currentEligibility.selectable && (
                          <div
                            id={`unit-blocked-${unit.id}`}
                            className="max-w-40 text-xs text-gray-600"
                          >
                            Không thể chọn vì Unit đang ở trạng thái {unit.status}.
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

      <div className="flex items-center justify-between text-sm">
        <span className="text-gray-500">
          {query.data?.total ?? 0} kết quả · Trang {page}/{totalPages}
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

function eligibilityLabel(unit: BookingUnitFinderRow) {
  if (unit.currentEligibility.mode === "IMMEDIATE") return "AVAILABLE";
  if (unit.currentEligibility.mode === "QUEUE") {
    return unit.currentEligibility.queueCount > 0
      ? `QUEUE ELIGIBLE · ${unit.currentEligibility.queueCount}`
      : "QUEUE ELIGIBLE";
  }
  return "NOT ELIGIBLE";
}
