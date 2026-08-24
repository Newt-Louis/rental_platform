import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BookingWorkspaceDialog } from "./BookingWorkspaceDialog";

const create = vi.fn();
const toast = vi.fn();

vi.mock("@/api", () => ({
  bookingApi: { create: (...args: any[]) => create(...args) },
  spacesApi: { listMalls: vi.fn().mockResolvedValue([]) },
  usersApi: {
    listUsers: vi
      .fn()
      .mockResolvedValue({ data: [{ id: "user-1", fullName: "Lan" }] }),
  },
}));

vi.mock("@/components/ui/use-toast", () => ({ useToast: () => ({ toast }) }));

vi.mock("./UnitFinder", () => ({
  UnitFinder: ({ onSelect }: any) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "unit-1",
          code: "A101",
          name: "Corner",
          mallId: "mall-1",
          areaNLA: 100,
          areaGFA: 120,
          status: "BOOKING",
          mall: { id: "mall-1", name: "Mall One" },
          floor: { name: "Tầng 1" },
          zone: { name: "Khu A" },
          currentEligibility: {
            selectable: true,
            mode: "QUEUE",
            queueCount: 2,
          },
        })
      }
    >
      Mock select Unit
    </button>
  ),
}));

vi.mock("./PartyFinder", () => ({
  PartyFinder: ({ onSelect }: any) => (
    <button
      type="button"
      onClick={() =>
        onSelect({
          id: "lead-1",
          mallId: "mall-1",
          brandName: "NIKE",
          contactName: "An",
          status: "QUALIFIED",
          expectedArea: 88,
          assignedToId: "user-1",
        })
      }
    >
      Mock select Lead
    </button>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("BookingWorkspaceDialog", () => {
  it("keeps selected Unit and Lead visible and creates through the existing payload", async () => {
    create.mockResolvedValue({
      bookingNumber: "BK-1",
      status: "PENDING",
      priority: 2,
    });
    const onClose = vi.fn();
    renderWorkspace(onClose);
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mock select Unit" }));
    await user.click(screen.getByRole("button", { name: "Mock select Lead" }));
    expect(screen.getByText(/A101 — Corner/)).toBeInTheDocument();
    expect(screen.getByText("NIKE")).toBeInTheDocument();
    expect(screen.getByText(/Booking mới sẽ vào hàng chờ/)).toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Ghi chú Booking"),
      "Site visit complete",
    );
    await user.click(
      screen.getByRole("button", { name: "Tạo Booking vào hàng chờ" }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          unitId: "unit-1",
          leadId: "lead-1",
          holdDays: 30,
          notes: "Site visit complete",
        }),
      ),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("preserves selections and entered data after an API error", async () => {
    create.mockRejectedValue({
      response: { data: { message: "Unit status changed" } },
    });
    renderWorkspace(vi.fn());
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mock select Unit" }));
    await user.click(screen.getByRole("button", { name: "Mock select Lead" }));
    await user.type(screen.getByLabelText("Ghi chú Booking"), "Keep me");
    await user.click(
      screen.getByRole("button", { name: "Tạo Booking vào hàng chờ" }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unit status changed",
    );
    expect(screen.getByText(/A101 — Corner/)).toBeInTheDocument();
    expect(screen.getByText("NIKE")).toBeInTheDocument();
    expect(screen.getByLabelText("Ghi chú Booking")).toHaveValue("Keep me");
  });

  it("prefills available Lead details and still allows adjustments", async () => {
    create.mockResolvedValue({ bookingNumber: "BK-2", status: "ACTIVE" });
    renderWorkspace(vi.fn());
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Mock select Unit" }));
    await user.click(screen.getByRole("button", { name: "Mock select Lead" }));

    expect(screen.getByLabelText("Diện tích yêu cầu")).toHaveDisplayValue("88");
    expect(screen.getByLabelText("Phụ trách (Sale)")).toHaveValue("user-1");

    await user.clear(screen.getByLabelText("Diện tích yêu cầu"));
    await user.type(screen.getByLabelText("Diện tích yêu cầu"), "95");
    await user.click(
      screen.getByRole("button", { name: "Tạo Booking vào hàng chờ" }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ requestedArea: 95, assignedToId: "user-1" }),
      ),
    );
  });
});

function renderWorkspace(onClose: () => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BookingWorkspaceDialog open onClose={onClose} mallId="mall-1" />
    </QueryClientProvider>,
  );
}
