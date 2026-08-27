import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PartyFinder } from "./PartyFinder";

const listLeads = vi.fn();

vi.mock("@/api", () => ({
  crmApi: { listLeads: (...args: any[]) => listLeads(...args) },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) =>
      ({
        "workspace.selectedCustomer": "Khách hàng đã chọn",
        "workspace.change": "Thay đổi",
      })[key] ?? key,
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  listLeads.mockResolvedValue({
    data: [
      {
        id: "lead-1",
        mallId: "mall-1",
        brandName: "NIKE",
        contactName: "An",
        phone: "0901",
        email: "an@example.com",
        status: "QUALIFIED",
      },
      {
        id: "lead-2",
        mallId: "mall-2",
        brandName: "Other Mall",
        contactName: "Binh",
        status: "NEW",
      },
      {
        id: "lead-3",
        mallId: null,
        brandName: "No Mall",
        contactName: "Chi",
        status: "NEW",
      },
    ],
    total: 3,
    page: 1,
    limit: 10,
    totalPages: 1,
  });
});

describe("PartyFinder", () => {
  it("uses Mall-scoped, long-term, paginated Lead search and shows identifying context", async () => {
    renderFinder(vi.fn());
    expect(await screen.findByText("NIKE")).toBeInTheDocument();
    expect(screen.getByText("An · 0901")).toBeInTheDocument();
    expect(screen.getByText("an@example.com")).toBeInTheDocument();
    expect(listLeads).toHaveBeenCalledWith(
      expect.objectContaining({
        mallId: "mall-1",
        leaseTermType: "LONG",
        page: 1,
        limit: 10,
      }),
    );
  });

  it("shows only Leads that can be selected for the active Mall", async () => {
    const onSelect = vi.fn();
    renderFinder(onSelect);
    await screen.findByText("NIKE");

    expect(screen.queryByText("Other Mall")).not.toBeInTheDocument();
    expect(screen.queryByText("No Mall")).not.toBeInTheDocument();
    expect(screen.queryByText(/không thể chọn/i)).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Chọn Lead NIKE" }),
    );
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "lead-1" }),
    );
  });

  it("shows a retryable error state", async () => {
    listLeads.mockRejectedValue(new Error("network"));
    renderFinder(vi.fn());
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể tải dữ liệu",
    );
    expect(screen.getByRole("button", { name: /Thử lại/ })).toBeInTheDocument();
  });

  it("requests the next backend page", async () => {
    listLeads.mockResolvedValue({
      data: [
        { id: "lead-1", mallId: "mall-1", brandName: "NIKE", status: "NEW" },
      ],
      total: 12,
      page: 1,
      limit: 10,
      totalPages: 2,
    });
    renderFinder(vi.fn());
    await screen.findByText("NIKE");
    await userEvent.click(screen.getByRole("button", { name: "Sau" }));
    await waitFor(() =>
      expect(listLeads).toHaveBeenCalledWith(
        expect.objectContaining({ page: 2 }),
      ),
    );
  });

  it("collapses into a selected-party summary and allows changing the Lead", async () => {
    const onClear = vi.fn();
    renderFinder(
      vi.fn(),
      {
        id: "lead-1",
        mallId: "mall-1",
        brandName: "NIKE",
        contactName: "An",
        status: "QUALIFIED",
      },
      onClear,
    );

    expect(screen.queryByLabelText("Tìm Lead")).not.toBeInTheDocument();
    expect(screen.getByText("Khách hàng đã chọn")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Thay đổi" }));
    expect(onClear).toHaveBeenCalledOnce();
  });
});

function renderFinder(
  onSelect: (lead: any) => void,
  selectedLead: any = null,
  onClear?: () => void,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PartyFinder
        mallId="mall-1"
        selectedLead={selectedLead}
        onSelect={onSelect}
        onClear={onClear}
      />
    </QueryClientProvider>,
  );
}
