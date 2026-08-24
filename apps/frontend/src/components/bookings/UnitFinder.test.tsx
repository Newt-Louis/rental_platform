import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnitFinder } from "./UnitFinder";

const findUnits = vi.fn();
const listFloors = vi.fn();
const listZones = vi.fn();

vi.mock("@/api", () => ({
  bookingApi: { findUnits: (...args: any[]) => findUnits(...args) },
  spacesApi: {
    listFloors: (...args: any[]) => listFloors(...args),
    listZones: (...args: any[]) => listZones(...args),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) =>
      ({
        "workspace.unitFinder": "Tìm mặt bằng",
        "workspace.eligibility.immediate": "Có thể giữ",
        "workspace.eligibility.queue": "Hàng chờ",
        "workspace.eligibility.blocked": "Không khả dụng",
        "workspace.unitStatus.VACANT": "Còn trống",
        "workspace.unitStatus.BOOKING": "Đang giữ",
        "workspace.unitStatus.CONTRACTED": "Đã ký hợp đồng",
      })[key] ??
      options?.defaultValue ??
      key,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  listFloors.mockResolvedValue([{ id: "floor-1", name: "Tầng 1" }]);
  listZones.mockResolvedValue([{ id: "zone-1", name: "Khu A" }]);
  findUnits.mockResolvedValue(
    page([
      unit("unit-1", "A101", "VACANT", "IMMEDIATE", true),
      unit("unit-2", "A102", "BOOKING", "QUEUE", true, 2),
      unit("unit-3", "A103", "CONTRACTED", "BLOCKED", false),
    ]),
  );
});

describe("UnitFinder", () => {
  it("shows authoritative eligibility and disables non-eligible Units", async () => {
    const onSelect = vi.fn();
    renderFinder(onSelect);

    expect(await screen.findByText("Có thể giữ")).toBeInTheDocument();
    expect(screen.getByText("Hàng chờ")).toBeInTheDocument();
    expect(screen.getByText("2 Booking đang chờ")).toBeInTheDocument();
    expect(screen.getByText("Không khả dụng")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Không thể chọn vì mặt bằng đang ở trạng thái Đã ký hợp đồng.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Chọn Unit A103" }),
    ).toBeDisabled();

    await userEvent.click(
      screen.getByRole("button", { name: "Chọn Unit A102" }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "unit-2" }),
    );
  });

  it("uses backend pagination and keeps filters in the next-page request", async () => {
    findUnits.mockResolvedValue(
      page([unit("unit-1", "A101", "VACANT", "IMMEDIATE", true)], 25, 1, 3),
    );
    renderFinder(vi.fn());
    await screen.findByText("A101");

    fireEvent.change(screen.getByLabelText("NLA tối thiểu"), {
      target: { value: "50" },
    });
    await waitFor(() =>
      expect(findUnits).toHaveBeenCalledWith(
        expect.objectContaining({ minArea: 50, page: 1 }),
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() =>
      expect(findUnits).toHaveBeenCalledWith(
        expect.objectContaining({ minArea: 50, page: 2, limit: 10 }),
      ),
    );
  });

  it("resets all filters and returns to the first page", async () => {
    renderFinder(vi.fn());
    await screen.findByText("A101");

    fireEvent.change(screen.getByLabelText("Tìm theo mã hoặc tên Unit"), {
      target: { value: "corner" },
    });
    fireEvent.change(screen.getByLabelText("NLA tối thiểu"), {
      target: { value: "50" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Đặt lại bộ lọc" }),
    );

    expect(screen.getByLabelText("Tìm theo mã hoặc tên Unit")).toHaveValue("");
    expect(screen.getByLabelText("NLA tối thiểu")).toHaveDisplayValue("");
    await waitFor(() =>
      expect(findUnits).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: undefined,
          minArea: undefined,
          page: 1,
        }),
      ),
    );
  });

  it("renders empty and retryable error states", async () => {
    findUnits.mockResolvedValueOnce(page([]));
    const view = renderFinder(vi.fn());
    expect(
      await screen.findByText("Không tìm thấy mặt bằng"),
    ).toBeInTheDocument();

    findUnits.mockRejectedValue(new Error("network"));
    view.unmount();
    renderFinder(vi.fn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải dữ liệu",
    );
    expect(screen.getByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });
});

function renderFinder(onSelect: (unit: any) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <UnitFinder mallId="mall-1" selectedUnit={null} onSelect={onSelect} />
    </QueryClientProvider>,
  );
}

function page(
  data: any[],
  total = data.length,
  currentPage = 1,
  totalPages = 1,
) {
  return { data, total, page: currentPage, limit: 10, totalPages };
}

function unit(
  id: string,
  code: string,
  status: string,
  mode: string,
  selectable: boolean,
  queueCount = 0,
) {
  return {
    id,
    code,
    name: `${code} name`,
    mallId: "mall-1",
    floorId: "floor-1",
    zoneId: "zone-1",
    areaNLA: 100,
    areaGFA: 120,
    category: "Retail",
    status,
    leaseTermType: "LONG",
    mall: { id: "mall-1", name: "Mall One" },
    floor: { id: "floor-1", name: "Tầng 1" },
    zone: { id: "zone-1", name: "Khu A" },
    currentEligibility: {
      selectable,
      mode,
      reasonCode: selectable ? null : `UNIT_STATUS_${status}`,
      queueCount,
    },
  };
}
