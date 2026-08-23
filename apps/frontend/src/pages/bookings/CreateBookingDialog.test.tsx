import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CreateBookingDialog } from "./CreateBookingDialog";

const workspace = vi.fn((_props: any) => <div>Shared Booking Workspace</div>);

vi.mock("@/components/bookings/BookingWorkspaceDialog", () => ({
  BookingWorkspaceDialog: (props: any) => workspace(props),
}));

describe("CreateBookingDialog compatibility wrapper", () => {
  it("uses the shared Booking Workspace and passes Mall context", () => {
    const onClose = vi.fn();
    render(<CreateBookingDialog open onClose={onClose} mallId="mall-1" />);

    expect(screen.getByText("Shared Booking Workspace")).toBeInTheDocument();
    expect(workspace).toHaveBeenCalledWith(
      expect.objectContaining({
        open: true,
        onClose,
        mallId: "mall-1",
      }),
    );
  });
});
