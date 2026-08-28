import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { departmentsApi } from "@/api";
import { useAuthStore } from "@/store/auth.store";
import { useMallStore } from "@/store/mall.store";
import { DepartmentsTab } from "./DepartmentsTab";

vi.mock("@/api", () => ({
  departmentsApi: {
    malls: vi.fn(),
    list: vi.fn(),
    options: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const malls = [
  { id: "mall-1", name: "Mall One", code: "M1" },
  { id: "mall-2", name: "Mall Two", code: "M2" },
];

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <DepartmentsTab />
    </QueryClientProvider>,
  );
}

describe("DepartmentsTab Mall scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(departmentsApi.malls).mockResolvedValue(malls as any);
    vi.mocked(departmentsApi.list).mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    } as any);
    useMallStore.setState({
      selectedMallId: null,
      selectedMallName: "Tất cả Mall",
    });
  });

  it("lets ADMIN choose a Mall before loading its Departments", async () => {
    useAuthStore.setState({
      user: {
        id: "admin",
        email: "admin@example.com",
        fullName: "Admin",
        role: "ADMIN",
        isActive: true,
      },
    });
    renderTab();

    const selector = await screen.findByLabelText("mall.label");
    expect(selector).not.toBeDisabled();
    expect(departmentsApi.list).not.toHaveBeenCalled();
    await screen.findByRole("option", { name: "Mall Two" });

    fireEvent.change(selector, { target: { value: "mall-2" } });
    await waitFor(() =>
      expect(departmentsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ mallId: "mall-2", page: 1, limit: 20 }),
      ),
    );
  });

  it("locks MALL_DIRECTOR to the authorised active Mall", async () => {
    useAuthStore.setState({
      user: {
        id: "director",
        email: "director@example.com",
        fullName: "Director",
        role: "MALL_DIRECTOR",
        isActive: true,
        activeMallId: "mall-1",
      },
    });
    useMallStore.setState({
      selectedMallId: "mall-1",
      selectedMallName: "Mall One",
    });
    renderTab();

    const selector = await screen.findByLabelText("mall.label");
    await waitFor(() => expect(selector).toHaveValue("mall-1"));
    expect(selector).toBeDisabled();
    await waitFor(() =>
      expect(departmentsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ mallId: "mall-1" }),
      ),
    );
  });

  it("locks CEO to the sole accessible Mall when no active Mall is set", async () => {
    vi.mocked(departmentsApi.malls).mockResolvedValue([malls[0]] as any);
    useAuthStore.setState({
      user: {
        id: "ceo",
        email: "ceo@example.com",
        fullName: "CEO",
        role: "CEO",
        isActive: true,
        activeMallId: null,
      },
    });
    renderTab();

    const selector = await screen.findByLabelText("mall.label");
    await waitFor(() => expect(selector).toHaveValue("mall-1"));
    expect(selector).toBeDisabled();
    await waitFor(() =>
      expect(departmentsApi.list).toHaveBeenCalledWith(
        expect.objectContaining({ mallId: "mall-1" }),
      ),
    );
  });
});
